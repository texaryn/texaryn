import { readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createFormRuntime, compile } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormProvider, FormRoot, createDefaultRegistry } from '@texaryn/react'
import { chromium } from 'playwright'
import { createServer } from 'vite'

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

async function browserBenchmarks() {
  const server = await createServer({
    root: appRoot,
    configFile: resolve(appRoot, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  })

  let browser
  try {
    await server.listen()
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite did not open a TCP port.')

    browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] })

    const memory = {}
    for (const fieldCount of [10, 50, 200]) {
      const page = await browser.newPage()
      await page.goto(`http://127.0.0.1:${address.port}/playground/benchmarks/?fields=${fieldCount}`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForFunction(
        () => window.__texarynBenchReady === true || window.__texarynBenchError,
        undefined,
        { timeout: 60000 },
      )
      const pageError = await page.evaluate(() => window.__texarynBenchError)
      if (pageError) throw new Error(pageError)

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
        await page.evaluate(() => window.__texarynBench.mount())
        await page.evaluate(() => window.__texarynBench.unmount())
      }
      const baselineBytes = await heapBytes()
      const nodeCount = await page.evaluate(() => window.__texarynBench.mount())
      const mountedBytes = await heapBytes()
      await page.evaluate(() => window.__texarynBench.unmount())
      const afterUnmountBytes = await heapBytes()

      for (let cycle = 0; cycle < 50; cycle++) {
        await page.evaluate(() => window.__texarynBench.mount())
        await page.evaluate(() => window.__texarynBench.unmount())
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

    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${address.port}/playground/benchmarks/?fields=50`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(() => window.__texarynBenchReady === true, undefined, { timeout: 60000 })
    await page.evaluate(() => window.__texarynBench.mount())
    await page.evaluate(() => {
      const input = document.querySelector('input[type="checkbox"]')
      if (!(input instanceof HTMLInputElement)) throw new Error('Benchmark form has no conditional checkbox.')
      window.__texarynInputSamples = []
      window.__texarynInputMismatches = 0
      input.addEventListener('input', (event) => {
        const started = event.timeStamp
        const expected = input.checked
        requestAnimationFrame(() => {
          const current = window.__texarynBench.data()
          const extraVisible = Array.from(document.querySelectorAll('label'))
            .some((label) => label.textContent?.includes('Extra'))
          if (current?.enabled !== expected || extraVisible !== expected) {
            window.__texarynInputMismatches++
            return
          }
          window.__texarynInputSamples.push(performance.now() - started)
        })
      }, { capture: true })
    })

    const input = page.locator('input[type="checkbox"]').first()
    const targetEvents = 200
    let capturedEvents = 0
    for (let index = 0; index < targetEvents / 2; index++) {
      await input.check()
      capturedEvents++
      await page.waitForFunction((count) => window.__texarynInputSamples.length >= count, capturedEvents)
      await input.uncheck()
      capturedEvents++
      await page.waitForFunction((count) => window.__texarynInputSamples.length >= count, capturedEvents)
    }

    const latency = await page.evaluate(() => ({
      samples: window.__texarynInputSamples,
      mismatches: window.__texarynInputMismatches,
    }))
    if (latency.mismatches !== 0 || latency.samples.length !== targetEvents) {
      throw new Error('Input samples did not observe matching runtime data and conditional DOM for every event.')
    }
    await page.evaluate(() => window.__texarynBench.unmount())
    await page.close()

    return { chromium: browser.version(), memory, inputToDomUpdate: summarize(latency.samples) }
  } finally {
    await browser?.close()
    await server.close()
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
      browserInputEvents: 200,
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
