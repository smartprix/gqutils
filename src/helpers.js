import castArray from 'lodash/castArray';
import forEach from 'lodash/forEach';
import isPlainObject from 'lodash/isPlainObject';
import pick from 'lodash/pick';

function humanizeError(field, error) {
	let message = error.message;
	const keyword = error.keyword;
	const params = error.params;

	if (!keyword) {
		return {message};
	}

	if (keyword === 'required') {
		message = `${field} is required`;
	}
	else if (keyword === 'type') {
		const type = params.type;
		message = `${field} should be of type ${type}`;
	}
	else if (keyword === 'format') {
		const format = params.format;
		message = `${field} should be a valid ${format}`;
	}
	else if (keyword === 'minLength') {
		const limit = params.limit;
		if (limit === 1) {
			message = `${field} is required`;
		}
		else {
			message = `${field} must be larger than ${limit} chars`;
		}
	}
	else if (keyword === 'maxLength') {
		const limit = params.limit;
		message = `${field} must be shorter than ${limit} chars`;
	}

	return {message};
}

function formatError(error) {
	error.fields = {};

	const isDev = process.env.NODE_ENV !== 'production';

	const originalError = error.originalError || error;
	const message = originalError.data || originalError.message;
	const errorType = originalError.constructor.name;

	if (isDev) {
		error._stack = error.stack;
		error._type = errorType;
	}

	if (errorType === 'ValidationError' || errorType === 'UserError') {
		if (typeof message === 'string') {
			error.fields.global = {message};
		}
		else if (isPlainObject(message)) {
			forEach(message, (value, key) => {
				if (typeof value === 'string') {
					error.fields[key] = {
						message: value,
					};
				}
				else if (Array.isArray(value)) {
					error.fields[key] = humanizeError(key, value[0]);
				}
				else {
					error.fields[key] = value;
				}
			});
		}

		if (isDev) {
			error._originalData = originalError.data;
			error._originalMessage = originalError.message;
		}

		error.message = 'Your query has errors';
	}
	else if (errorType === 'GraphQLError' && typeof message === 'string') {
		let matches;
		matches = message.match(/Unknown argument "([a-zA-Z0-9_$.-]+)"/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `Unknown Argument ${matches[1]}`,
				keyword: 'required',
			};
		}

		matches = message.match(/Argument "([a-zA-Z0-9_$.-]+)" has invalid/);
		if (matches) {
			error.fields[matches[1]] = {
				message: 'Invalid Value',
				keyword: 'required',
			};
		}

		matches = message.match(/Cannot query field "([a-zA-Z0-9_$.-]+)" on/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `Field ${matches[1]} does not exist`,
				keyword: 'required',
			};
		}

		matches = message.match(/argument "([a-zA-Z0-9_$.-]+)" of type ".*?" is required/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `${matches[1]} is required`,
				keyword: 'required',
			};
		}
	}
	else {
		if (isDev) {
			error._originalMessage = error.message;
		}

		error.message = 'Server error';
		error.fields.global = {
			message: error.message,
			keyword: 'internal',
		};
	}

	return error;
}

class GqlEnum {
	constructor(name, val) {
		this.name = name;
		this.value = val;
	}

	toString() { return this.name }
}

class GqlFragment {
	constructor(fragment) {
		this.name = fragment.name;
		this.type = fragment.type;
		this.fields = fragment.fields;
	}

	toString() { return `... ${this.name}` }

	getName() { return this.name }

	getDefinition() {
		return `fragment ${this.name} on ${this.type} { ${this.fields} } `;
	}
}

function convertObjToGqlArg(obj) {
	const gqlArg = [];
	forEach(obj, (value, key) => {
		if (value === undefined) return;
		// eslint-disable-next-line no-use-before-define
		gqlArg.push(`${key}: ${convertToGqlArg(value)}`);
	});
	return `${gqlArg.join(', ')}`;
}

function convertToGqlArg(value) {
	if (value == null) return null;

	if (typeof value === 'number') return String(value);
	if (value instanceof GqlEnum) return value.toString();
	if (isPlainObject(value)) return `{${convertObjToGqlArg(value)}}`;
	if (Array.isArray(value)) {
		return `[${value.map(convertToGqlArg).join(', ')}]`;
	}

	return JSON.stringify(value);
}

function toGqlArg(arg, opts = {}) {
	let gqlArg = '';
	if (isPlainObject(arg)) {
		if (Array.isArray(opts)) opts = {pick: opts};
		if (opts.pick) arg = pick(arg, opts.pick);

		gqlArg = convertObjToGqlArg(arg);

		if (opts.curlyBrackets) gqlArg = `{${gqlArg}}`;
	}
	else {
		gqlArg = convertToGqlArg(arg);
	}

	if (opts.roundBrackets) gqlArg = gqlArg ? `(${gqlArg})` : ' ';

	return gqlArg || '# no args <>\n';
}

/**
 * Handles these cases:
 * 	- `{nodes {parent {id }}}` and checking for `parent`
 * 	- `{nodes {parentId }}` and checking for `parentId`
 * 	- `{ parent {id}}` and checking for `parent`
 * 	- `{count}` and checking for `count`
 * @param {string} field The field to be found
 * @param {string[]} fields An array of fields in which to look for field
 * 		Result of `getFieldNames`
 * @returns {boolean} true if field is a substring of any item in the fields array,
 * false otherwise
 */
function includesField(field, fields) {
	for (const queryField of fields) {
		if (`.${queryField}.`.includes(`.${field}.`)) return true;
	}
	return false;
}

function parseFragmentFields(fields) {
	const fieldsString = castArray(fields).map((field) => {
		if (typeof field === 'string') return field;
		let str = '';
		if (field.alias) { str += `${field.alias} : ` }
		str += field.name;

		if (field.args) {
			str += toGqlArg(field.args, {roundBrackets: true});
		}

		if (field.fields) {
			str += `{ ${parseFragmentFields(field.fields)} }`;
		}
		return str;
	}).join('\n');

	return `${fieldsString}`;
}

export {
	formatError,
	humanizeError,
	convertObjToGqlArg,
	convertToGqlArg,
	toGqlArg,
	GqlEnum,
	GqlFragment,
	includesField,
	parseFragmentFields,
};
