// Run independent teams concurrently; dependent teams receive only completed reports.
export function taskDependencies(tasks) {
  const ids = new Set(tasks.map(t => t.id));
  return new Map(tasks.map(task => {
    let declared = [];
    try { declared = JSON.parse(task.dependencies_json || '[]'); } catch { throw new Error('업무 선행 관계를 읽을 수 없습니다.'); }
    if (!Array.isArray(declared) || declared.some(id => !ids.has(id) || id === task.id)) throw new Error('유효하지 않은 선행 업무가 있습니다.');
    const implicit = tasks.filter(other => {
      if (other.id === task.id) return false;
      if (task.agent === 'verification') return other.agent !== 'verification';
      if (task.agent === 'records') return !['records','verification'].includes(other.agent);
      if (['assemblypr','localpr'].includes(task.agent)) return ['schedule','policy','audit','civil','organization'].includes(other.agent);
      return false;
    }).map(t => t.id);
    return [task.id, [...new Set([...declared, ...implicit])]];
  }));
}

export async function runTeamTasks(tasks, execute, concurrency = 3) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('동시 실행 수를 확인해주세요.');
  if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('중복된 업무가 있습니다.');
  const dependencies = taskDependencies(tasks), results = new Map(), pending = new Map(tasks.map(t => [t.id,t]));
  // Validate the entire graph before any external call.
  const checked = new Set();
  while (checked.size < tasks.length) {
    const next = tasks.filter(t => !checked.has(t.id) && dependencies.get(t.id).every(id => checked.has(id)));
    if (!next.length) throw new Error('업무 선행 관계에 순환이 있습니다.');
    next.forEach(t => checked.add(t.id));
  }
  while (pending.size) {
    const ready = [...pending.values()].filter(t => dependencies.get(t.id).every(id => results.has(id))).slice(0,concurrency);
    const settled = await Promise.allSettled(ready.map(task => execute(task, dependencies.get(task.id).map(id => results.get(id)).join('\n\n'))));
    // Wait for all siblings to settle before propagating failure, avoiding writes from a failed attempt after retry.
    settled.forEach((result,i) => { if(result.status === 'fulfilled'){ results.set(ready[i].id,result.value);pending.delete(ready[i].id); } });
    const failure = settled.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  return tasks.map(t => results.get(t.id)).join('\n\n');
}
