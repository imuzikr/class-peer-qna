"use strict";

// A temporary deployment artifact: preserve every original read predicate and
// remove every client write grant. The canonical Firestore rules stay unchanged.
function pausedFirestoreRules(source) {
  let clauses = 0;
  const result = source.replace(/^([ \t]*)allow\s+([\w,\s]+):\s*if\s+([\s\S]*?);/gm,
    (_match, indent, operations, predicate) => {
      clauses += 1;
      const ops = operations.split(",").map((op) => op.trim());
      if (ops.some((op) => !["read", "get", "list", "write", "create", "update", "delete"].includes(op))) {
        throw new Error("Unknown Firestore operation");
      }
      const reads = ops.filter((op) => ["read", "get", "list"].includes(op));
      const writes = ops.filter((op) => !reads.includes(op));
      return [reads.length ? `${indent}allow ${reads.join(", ")}: if ${predicate};` : null,
        writes.length ? `${indent}allow ${writes.join(", ")}: if false;` : null].filter(Boolean).join("\n");
    });
  if (!clauses || clauses !== (source.match(/^[ \t]*allow\s/gm) || []).length) {
    throw new Error("Could not transform every Firestore grant");
  }
  return result;
}

module.exports = { pausedFirestoreRules };
