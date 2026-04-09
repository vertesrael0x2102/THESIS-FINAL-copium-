export const getEdgeKey = (u, v) => `${u}-${v}`;

export const getReverseKey = (u, v) => `${v}-${u}`;


/* check if edge is blocked */
export const isEdgeBlocked = (u, v, blockedEdges) => {

const key = getEdgeKey(u, v);
const reverse = getReverseKey(u, v);

return blockedEdges.has(key) || blockedEdges.has(reverse);

};


/* toggle block */
export const toggleEdgeBlock = (u, v, blockedEdges) => {

const copy = new Set(blockedEdges);

const key = getEdgeKey(u, v);
const reverse = getReverseKey(u, v);

if (copy.has(key)) {

copy.delete(key);
copy.delete(reverse);

} else {

copy.add(key);
copy.add(reverse);

}

return copy;

};


/* clear all blocks */
export const resetBlockedEdges = () => {
return new Set();
};