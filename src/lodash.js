export function castArray(val) {
	return Array.isArray(val) ? val : [val];
}

export function isEmpty(val) {
	if (val == null || val === false || val === 0) return true;
	if (Array.isArray(val) || typeof val === 'string') return !val.length;
	if (val instanceof Set || val instanceof Map) return !val.size;
	if (typeof val === 'object') return Object.keys(val).length === 0;
	return false;
}

export function isPlainObject(val) {
	return Object.prototype.toString.call(val) === '[object Object]';
}

export function pick(obj, keys) {
	return Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
}

export function omit(obj, keys) {
	return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
}

export function mapValues(obj, fn) {
	return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v, k)]));
}

export function forEach(coll, fn) {
	if (Array.isArray(coll)) coll.forEach(fn);
	else Object.entries(coll).forEach(([k, v]) => fn(v, k));
}

export function merge(target, ...sources) {
	for (const source of sources) {
		if (!source || typeof source !== 'object') continue;
		for (const key of Object.keys(source)) {
			const sourceValue = source[key];
			const targetValue = target[key];
			// Handle Arrays
			if (Array.isArray(sourceValue)) {
				if (!Array.isArray(targetValue)) {
					target[key] = [];
				}
				// Recursively merge array elements by index
				merge(target[key], sourceValue);
			}
			// Handle Plain Objects
			else if (isPlainObject(sourceValue)) {
				// eslint-disable-next-line max-depth
				if (!isPlainObject(targetValue)) {
					target[key] = {};
				}
				merge(target[key], sourceValue);
			}
			// Handle Primitives
			else if (sourceValue !== undefined) {
				// Lodash ignores undefined source values
				target[key] = sourceValue;
			}
		}
	}
}


export function defaults(target, source) {
	for (const [k, v] of Object.entries(source)) {
		if (target[k] === undefined) target[k] = v;
	}
	return target;
}
