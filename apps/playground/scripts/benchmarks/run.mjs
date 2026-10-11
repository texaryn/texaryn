import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os, { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createFormRuntime, compile } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormProvider, FormRoot, createDefaultRegistry } from '@texaryn/react'
import { chromium } from 'playwright'
import { build, preview } from 'vite'

const appRoot = fileURLToPath(new URL('../..', import.meta.url))
const repoRoot = resolve(appRoot, '../..')
const warmups = 5
const compilerSamples = 200
const firstRenderSamples = 20

function schemaFor(fieldCount, { conditional = false, array = false } = {}) {
  const properties = Object.fromEntries(Array.from({ length: fieldCount }, (_, index) => [
    `field_${index}`,
    { type: 'string', title: `Field ${index}` },
  ]))

  if (conditional) {
    properties.enabled = { type: 'boolean', title: 'Enabled' }
  }

  if (array) {
    properties.rows = {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string', title: 'Label' } },
      },
    }
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    ...(conditional
      ? {
          allOf: [{
            if: { properties: { enabled: { const: true } } },
            then: { properties: { extra: { type: 'string', title: 'Extra' } } },
          }],
        }
      : {}),
  }
}

function dataFor(fieldCount, { conditional = false, arraySize = 0 } = {}) {
  return {
    ...Object.fromEntries(Array.from({ length: fieldCount }, (_, index) => [
      `field_${index}`,
      `value-${index}`,
    ])),
    ...(conditional ? { enabled: false } : {}),
    ...(arraySize > 0
      ? { rows: Array.from({ length: arraySize }, (_, index) => ({ label: `row-${index}` })) }
      : {}),
  }
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

function summarize(values) {
  return {
    samples: values.length,
    p50Ms: Number(percentile(values, 0.5).toFixed(4)),
    p95Ms: Number(percentile(values, 0.95).toFixed(4)),
  }
}

async function repositoryCommit() {
  const dotGit = resolve(repoRoot, '.git')
  const dotGitStat = await stat(dotGit)
  let gitDir = dotGit
  let commonDir = dotGit

  if (dotGitStat.isFile()) {
    const gitDirMatch = (await readFile(dotGit, 'utf8')).trim().match(/^gitdir:\s*(.+)$/)
    if (!gitDirMatch) throw new Error('Could not resolve the repository Git directory.')
    gitDir = resolve(repoRoot, gitDirMatch[1])
    commonDir = gitDir
    const commonDirValue = await readFile(resolve(gitDir, 'commondir'), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (commonDirValue) commonDir = resolve(gitDir, commonDirValue.trim())
  }

  const head = (await readFile(resolve(gitDir, 'HEAD'), 'utf8')).trim()
  const hashPattern = /^[\da-f]{40}(?:[\da-f]{24})?$/i
  if (hashPattern.test(head)) return head

  const reference = head.match(/^ref:\s*(\S+)$/)?.[1]
  if (!reference) throw new Error('Could not resolve the repository HEAD revision.')

  for (const directory of new Set([gitDir, commonDir])) {
    const hash = await readFile(resolve(directory, reference), 'utf8').then((value) => value.trim()).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (hash && hashPattern.test(hash)) return hash
  }

  const packedRefs = await readFile(resolve(commonDir, 'packed-refs'), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
  const packedRef = packedRefs.split('\n').find((line) => line.endsWith(` ${reference}`))
  const packedHash = packedRef?.split(' ')[0]
  if (packedHash && hashPattern.test(packedHash)) return packedHash

  throw new Error(`Could not find the Git hash for ${reference}.`)
}

async function sampleAsync(fn, count = firstRenderSamples) {
  for (let index = 0; index < warmups; index++) await fn()
  const values = []
  for (let index = 0; index < count; index++) {
    const start = performance.now()
    await fn()
    values.push(performance.now() - start)
  }
  return summarize(values)
}

function sampleSync(fn, count = compilerSamples) {
  for (let index = 0; index < warmups; index++) fn()
  const values = []
  for (let index = 0; index < count; index++) {
    const start = performance.now()
    fn()
    values.push(performance.now() - start)
  }
  return summarize(values)
}

function sampleDispatch(runtime, command, { before, after, count = 60 } = {}) {
  const values = []
  const iterations = warmups + count
  for (let index = 0; index < iterations; index++) {
    before?.(index)
    const nextCommand = command(index)
    if (index < warmups) {
      runtime.dispatch(nextCommand)
    } else {
      const start = performance.now()
      runtime.dispatch(nextCommand)
      values.push(performance.now() - start)
    }
    after?.(index)
  }
  return summarize(values)
}

async function compileBenchmarks() {
  const results = {}
  for (const fieldCount of [10, 50, 200]) {
    const port = await createJsonSchemaAdapter(schemaFor(fieldCount))
    const data = dataFor(fieldCount)
    const projection = port.project(data)
    const baseline = compile(projection, data).document
    results[fieldCount] = {
      nodeCount: Object.keys(baseline.nodes).length,
      compile: sampleSync(() => compile(projection, data)),
    }
  }
  return results
}

async function firstRenderBenchmarks() {
  const registry = createDefaultRegistry()
  const results = {}
  for (const fieldCount of [10, 50, 200]) {
    const schema = schemaFor(fieldCount)
    const data = dataFor(fieldCount)
    results[fieldCount] = await sampleAsync(async () => {
      const port = await createJsonSchemaAdapter(structuredClone(schema))
      const runtime = createFormRuntime(port, { initialData: structuredClone(data) })
      const tree = React.createElement(
        FormProvider,
        { value: runtime },
        React.createElement(FormRoot, { registry }),
      )
      const html = renderToString(tree)
      runtime.destroy()
      if (html.length === 0) throw new Error('React server render returned empty HTML.')
    }, 20)
  }
  return results
}

async function validationBenchmark() {
  const port = await createJsonSchemaAdapter(schemaFor(50))
  const data = dataFor(50)
  const firstResult = port.validate(data)
  const isAsync = firstResult != null && typeof firstResult.then === 'function'
  const initial = isAsync ? await firstResult : firstResult
  if (!initial.valid) throw new Error('Validation benchmark data must pass its schema.')

  for (let index = 0; index < 100; index++) {
    const result = port.validate(data)
    if (isAsync) await result
  }

  const iterations = 2000
  const start = performance.now()
  if (isAsync) {
    for (let index = 0; index < iterations; index++) await port.validate(data)
  } else {
    for (let index = 0; index < iterations; index++) port.validate(data)
  }
  const elapsedMs = performance.now() - start
  return {
    iterations,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    validationsPerSecond: Math.round(iterations / (elapsedMs / 1000)),
  }
}

async function arrayBenchmarks() {
  const results = {}
  for (const size of [10, 100, 1000]) {
    const port = await createJsonSchemaAdapter(schemaFor(0, { array: true }))
    const runtime = createFormRuntime(port, { initialData: dataFor(0, { arraySize: size }) })
    const document = runtime.document.getSnapshot()
    const array = Object.values(document.nodes).find((node) =>
      node.type === 'container' && node.containerType === 'array',
    )
    if (!array) throw new Error('Array benchmark schema did not compile an array container.')

    const commandCount = size === 1000 ? 30 : 60
    const insert = sampleDispatch(
      runtime,
      () => ({ type: 'InsertItem', containerId: array.id, index: size, value: { label: 'new' } }),
      { after: () => runtime.dispatch({ type: 'RemoveItem', containerId: array.id, index: size }), count: commandCount },
    )
    const remove = sampleDispatch(
      runtime,
      () => ({ type: 'RemoveItem', containerId: array.id, index: size }),
      {
        before: () => runtime.dispatch({ type: 'InsertItem', containerId: array.id, index: size, value: { label: 'new' } }),
        count: commandCount,
      },
    )
    let moveIndex = 0
    const move = sampleDispatch(
      runtime,
      () => {
        const from = moveIndex++ % 2 === 0 ? 0 : size - 1
        return { type: 'MoveItem', containerId: array.id, from, to: from === 0 ? size - 1 : 0 }
      },
      { count: commandCount },
    )

    runtime.destroy()
    results[size] = { insert, remove, move }
  }
  return results
}

function shuffle(values) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

async function openBenchmarkPage(browser, origin, fieldCount) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  const response = await page.goto(`${origin}/benchmarks/?fields=${fieldCount}`, { waitUntil: 'load' })
  try {
    await page.waitForFunction(
      () => window.__texarynBenchReady === true || window.__texarynBenchError,
      undefined,
      { timeout: 20000 },
    )
  } catch (error) {
    throw new Error([
      `Benchmark page did not initialize (HTTP ${response?.status() ?? 'no response'}).`,
      ...pageErrors,
      ...consoleErrors,
      error instanceof Error ? error.message : String(error),
    ].join('\n'))
  }
  const pageError = await page.evaluate(() => window.__texarynBenchError)
  if (pageError) throw new Error(pageError)
  return { page, pageErrors, consoleErrors }
}

async function prepareRenderer(page, renderer) {
  await page.evaluate((name) => window.__texarynBench.prepare(name), renderer)
}

async function mountRenderer(page, renderer) {
  await prepareRenderer(page, renderer)
  return page.evaluate(() => window.__texarynBench.mount())
}

async function unmountRenderer(page) {
  await page.evaluate(() => window.__texarynBench.unmount())
}

async function waitForConditionalState(page, enabled) {
  await page.waitForFunction(
    (expected) => {
      const data = window.__texarynBench.data()
      const extraVisible = Array.from(document.querySelectorAll('#root label'))
        .some((label) => {
          const control = label.control
          return label.textContent?.trim().includes('Extra')
            && control !== null
            && label.closest('[hidden]') === null
            && control.closest('[hidden]') === null
        })
      return data?.enabled === expected && extraVisible === expected
    },
    enabled,
    { polling: 'raf', timeout: 10000 },
  )
}

async function crossRendererBenchmarks(browser, origin) {
  const renderers = ['react', 'vue', 'svelte', 'solid', 'web-components', 'angular']
  const trials = 5
  const mountWarmupsPerTrial = 2
  const measuredMountsPerTrial = 3
  const inputWarmupCyclesPerTrial = 5
  const inputTransitionsPerTrial = 200
  const mountSamples = Object.fromEntries(renderers.map((name) => [name, []]))
  const activationSamples = Object.fromEntries(renderers.map((name) => [name, []]))
  const removalSamples = Object.fromEntries(renderers.map((name) => [name, []]))
  const trialResults = Object.fromEntries(renderers.map((name) => [name, []]))
  const rendererOrders = []

  for (let trial = 0; trial < trials; trial++) {
    const order = shuffle(renderers)
    rendererOrders.push(order)

    for (const renderer of order) {
      const { page, pageErrors } = await openBenchmarkPage(browser, origin, 50)
      const trialMounts = []
      const trialActivations = []
      const trialRemovals = []

      try {
        for (let cycle = 0; cycle < mountWarmupsPerTrial; cycle++) {
          await mountRenderer(page, renderer)
          await unmountRenderer(page)
        }

        for (let sample = 0; sample < measuredMountsPerTrial; sample++) {
          await prepareRenderer(page, renderer)
          const elapsed = await page.evaluate(async () => {
            const startedAt = performance.now()
            await window.__texarynBench.mount()
            return performance.now() - startedAt
          })
          trialMounts.push(elapsed)
          mountSamples[renderer].push(elapsed)
          await unmountRenderer(page)
        }

        await mountRenderer(page, renderer)
        const checkbox = page.locator('#root input[type="checkbox"]').first()
        for (let cycle = 0; cycle < inputWarmupCyclesPerTrial; cycle++) {
          await checkbox.check()
          await waitForConditionalState(page, true)
          await checkbox.uncheck()
          await waitForConditionalState(page, false)
        }

        await page.evaluate(() => window.__texarynBench.startInputMeasurement())
        let completed = 0
        for (let index = 0; index < inputTransitionsPerTrial / 2; index++) {
          await checkbox.check()
          completed++
          await page.waitForFunction((count) => window.__texarynInputCompleted >= count, completed)
          await checkbox.uncheck()
          completed++
          await page.waitForFunction((count) => window.__texarynInputCompleted >= count, completed)
        }

        const input = await page.evaluate(() => ({
          samples: window.__texarynInputSamples,
          mismatches: window.__texarynInputMismatches,
          completed: window.__texarynInputCompleted,
        }))
        if (
          input.mismatches !== 0
          || input.completed !== inputTransitionsPerTrial
          || input.samples.length !== inputTransitionsPerTrial
        ) {
          throw new Error(`${renderer} did not produce matching runtime data and conditional DOM for every input event.`)
        }

        for (const sample of input.samples) {
          if (sample.enabled) {
            trialActivations.push(sample.elapsedMs)
            activationSamples[renderer].push(sample.elapsedMs)
          } else {
            trialRemovals.push(sample.elapsedMs)
            removalSamples[renderer].push(sample.elapsedMs)
          }
        }

        if (trialActivations.length !== inputTransitionsPerTrial / 2
          || trialRemovals.length !== inputTransitionsPerTrial / 2) {
          throw new Error(`${renderer} did not produce equal activation and removal samples.`)
        }

        if (pageErrors.length > 0) throw new Error(`${renderer} browser error: ${pageErrors[0]}`)
        trialResults[renderer].push({
          trial: trial + 1,
          mountToDomAtSecondAnimationFrame: summarize(trialMounts),
          activationToMatchingDomFrame: summarize(trialActivations),
          removalToMatchingDomFrame: summarize(trialRemovals),
        })
      } finally {
        await unmountRenderer(page).catch(() => {})
        await page.close()
      }
    }
  }

  return {
    fieldCount: 50,
    conditionalField: 'Extra',
    trials,
    inputTransitionsPerTrial,
    mountWarmupsPerTrial,
    measuredMountsPerTrial,
    inputWarmupCyclesPerTrial,
    rendererOrders,
    renderers: Object.fromEntries(renderers.map((renderer) => [renderer, {
      mountToDomAtSecondAnimationFrame: summarize(mountSamples[renderer]),
      conditionalTransitionToMatchingDomFrame: summarize([
        ...activationSamples[renderer],
        ...removalSamples[renderer],
      ]),
      activationToMatchingDomFrame: summarize(activationSamples[renderer]),
      removalToMatchingDomFrame: summarize(removalSamples[renderer]),
      trials: trialResults[renderer],
    }])),
  }
}

async function browserBenchmarks() {
  const outDir = await mkdtemp(resolve(tmpdir(), 'texaryn-performance-'))
  let server
  let browser

  try {
    await build({
      root: appRoot,
      configFile: resolve(appRoot, 'vite.config.ts'),
      mode: 'benchmark',
      build: {
        outDir,
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: { input: resolve(appRoot, 'benchmarks/index.html') },
      },
    })
    server = await preview({
      root: appRoot,
      configFile: resolve(appRoot, 'vite.config.ts'),
      mode: 'benchmark',
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0, strictPort: false },
    })
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite preview did not open a TCP port.')
    const origin = `http://127.0.0.1:${address.port}`

    browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] })

    const memory = {}
    for (const fieldCount of [10, 50, 200]) {
      const { page } = await openBenchmarkPage(browser, origin, fieldCount)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('HeapProfiler.enable')
      await cdp.send('Performance.enable')
      const heapBytes = async () => {
        await cdp.send('HeapProfiler.collectGarbage')
        const { metrics } = await cdp.send('Performance.getMetrics')
        const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value
        if (used === undefined) throw new Error('Chromium did not return JSHeapUsedSize.')
        return Math.round(used)
      }

      for (let cycle = 0; cycle < 10; cycle++) {
        await mountRenderer(page, 'react')
        await unmountRenderer(page)
      }
      const baselineBytes = await heapBytes()
      const nodeCount = await mountRenderer(page, 'react')
      const mountedBytes = await heapBytes()
      await unmountRenderer(page)
      const afterUnmountBytes = await heapBytes()

      for (let cycle = 0; cycle < 50; cycle++) {
        await mountRenderer(page, 'react')
        await unmountRenderer(page)
      }
      const afterCyclesBytes = await heapBytes()
      memory[fieldCount] = {
        nodeCount,
        mountedDeltaBytes: mountedBytes - baselineBytes,
        afterUnmountDeltaBytes: afterUnmountBytes - baselineBytes,
        afterFiftyCyclesDeltaBytes: afterCyclesBytes - baselineBytes,
      }
      await cdp.detach()
      await page.close()
    }

    return {
      chromium: browser.version(),
      buildMode: 'production',
      memory,
      crossRenderer: await crossRendererBenchmarks(browser, origin),
    }
  } finally {
    await browser?.close()
    await server?.close()
    await rm(outDir, { recursive: true, force: true })
  }
}

async function main() {
  if (typeof globalThis.gc !== 'function') {
    throw new TypeError('Run this benchmark with Node --expose-gc so memory measurements can collect garbage.')
  }

  const results = {
    commit: await repositoryCommit(),
    environment: {
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model ?? 'unknown',
      node: process.version,
      memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    },
    methodology: {
      warmups,
      compilerSamples,
      firstRenderSamples,
      arrayDispatchSamples: { 10: 60, 100: 60, 1000: 30 },
      validationIterations: 2000,
      crossRendererTrials: 5,
      crossRendererInputTransitionsPerTrial: 200,
      crossRendererMountWarmupsPerTrial: 2,
      crossRendererMeasuredMountsPerTrial: 3,
      crossRendererInputWarmupCyclesPerTrial: 5,
      memoryWarmupCycles: 10,
      memoryMeasuredCycles: 50,
    },
    compiler: await compileBenchmarks(),
    firstRender: await firstRenderBenchmarks(),
    arrayOperations: await arrayBenchmarks(),
    validation: await validationBenchmark(),
    browser: await browserBenchmarks(),
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
