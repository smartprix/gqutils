import _ from 'lodash';

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
		if (_.isString(message)) {
			error.fields.global = {message};
		}
		else if (_.isPlainObject(message)) {
			_.forEach(message, (value, key) => {
				if (_.isString(value)) {
					error.fields[key] = {
						message: value,
					};
				}
				else if (_.isArray(value)) {
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
	else if (errorType === 'GraphQLError' && _.isString(message)) {
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
	constructor(val) { this.val = val }
	toString() { return this.val }
}

class GqlFragment {
	constructor(fragment) { this.val = fragment }
	toString() { return `... ${this.val.name}` }
	getName() { return this.val.name }
	getDefinition() {
		return `fragment ${this.val.name} on ${this.val.type} { ${this.val.fields} } `;
	}
}

function convertObjToGqlArg(obj) {
	const gqlArg = [];
	_.forEach(obj, (value, key) => {
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
	if (_.isPlainObject(value)) return `{${convertObjToGqlArg(value)}}`;
	if (_.isArray(value) && value[0] instanceof GqlEnum) {
		return `[${value.map(v => v.toString()).join(', ')}]`;
	}

	return JSON.stringify(value);
}

function toGqlArg(arg, opts = {}) {
	let gqlArg = '';
	if (_.isPlainObject(arg)) {
		if (Array.isArray(opts)) opts = {pick: opts};
		if (opts.pick) arg = _.pick(arg, opts.pick);

		gqlArg = convertObjToGqlArg(arg);

		if (opts.curlyBrackets) gqlArg = `{${gqlArg}}`;
	}
	else {
		gqlArg = convertToGqlArg(arg);
	}

	if (opts.roundBrackets) gqlArg = gqlArg ? `(${gqlArg})` : ' ';

	return gqlArg || '# no args <>\n';
}

export {
	formatError,
	humanizeError,
	convertObjToGqlArg,
	convertToGqlArg,
	toGqlArg,
	GqlEnum,
	GqlFragment,
};
