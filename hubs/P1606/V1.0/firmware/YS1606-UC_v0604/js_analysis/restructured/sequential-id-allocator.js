// Original webpack module: 87653
//
// A second, simpler ID-allocator implementation, distinct from
// id-allocator.js (module 12543, which wraps the `number-allocator`
// interval-tree package). This one just wraps a sequential counter
// around the 1-65535 range starting from a random offset - register()
// always returns true without tracking anything, and deallocate()/clear()
// are no-ops, so freed IDs are never actually recycled; it just wraps
// around blindly once it hits 65536. Which consumer uses which allocator
// wasn't traced in this pass.
class SequentialIdAllocator {
  nextId;

  constructor() {
    this.nextId = Math.max(1, Math.floor(65535 * Math.random()));
  }

  allocate() {
    const id = this.nextId++;
    if (this.nextId === 65536) this.nextId = 1;
    return id;
  }

  getLastAllocated() {
    return this.nextId === 1 ? 65535 : this.nextId - 1;
  }

  register(id) {
    return true;
  }

  deallocate(id) {}

  clear() {}
}

module.exports = { SequentialIdAllocator };
