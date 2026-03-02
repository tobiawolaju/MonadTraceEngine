export async function extractTrace(provider, txHash, parallelIndex) {
  try {
    const trace = await provider.send('debug_traceTransaction', [txHash, { tracer: 'callTracer' }]);
    return {
      opcodes: flattenOpcodes(trace),
      internalCalls: flattenInternalCalls(trace),
      threadId: `thread-${parallelIndex}`
    };
  } catch {
    return {
      opcodes: [],
      internalCalls: [],
      threadId: `thread-${parallelIndex}`
    };
  }
}

function flattenOpcodes(trace) {
  if (!trace?.structLogs) return [];
  return trace.structLogs.map((step) => step.op).filter(Boolean);
}

function flattenInternalCalls(trace) {
  const calls = [];
  walk(trace?.calls || [], calls);
  return calls;
}

function walk(nodes, out) {
  for (const node of nodes) {
    out.push({
      type: node.type,
      from: node.from,
      to: node.to,
      value: node.value
    });
    if (node.calls?.length) walk(node.calls, out);
  }
}
