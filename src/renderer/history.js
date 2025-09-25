export function createHistory() {
  const past = [];
  const future = [];

  function commit(snapshot) {
    past.push(snapshot);
    future.length = 0;
  }

  function undo(currentSnapshot) {
    if (past.length === 0) {
      return null;
    }
    const snapshot = past.pop();
    future.push(currentSnapshot);
    return snapshot;
  }

  function redo(currentSnapshot) {
    if (future.length === 0) {
      return null;
    }
    const snapshot = future.pop();
    past.push(currentSnapshot);
    return snapshot;
  }

  function clear() {
    past.length = 0;
    future.length = 0;
  }

  return {
    commit,
    undo,
    redo,
    clear
  };
}