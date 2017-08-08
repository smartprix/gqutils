'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.humanizeError = exports.formatError = undefined;

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function humanizeError(field, error) {
	let message = error.message;
	const keyword = error.keyword;
	const params = error.params;

	if (!keyword) {
		return { message };
	}

	if (keyword === 'required') {
		message = `${field} is required`;
	} else if (keyword === 'type') {
		const type = params.type;
		message = `${field} should be of type ${type}`;
	} else if (keyword === 'format') {
		const format = params.format;
		message = `${field} should be a valid ${format}`;
	} else if (keyword === 'minLength') {
		const limit = params.limit;
		if (limit === 1) {
			message = `${field} is required`;
		} else {
			message = `${field} must be larger than ${limit} chars`;
		}
	} else if (keyword === 'maxLength') {
		const limit = params.limit;
		message = `${field} must be shorter than ${limit} chars`;
	}

	return { message };
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
		if (_lodash2.default.isString(message)) {
			error.fields.global = { message };
		} else if (_lodash2.default.isPlainObject(message)) {
			_lodash2.default.forEach(message, (value, key) => {
				if (_lodash2.default.isString(value)) {
					error.fields[key] = {
						message: value
					};
				} else if (_lodash2.default.isArray(value)) {
					error.fields[key] = humanizeError(key, value[0]);
				} else {
					error.fields[key] = value;
				}
			});
		}

		if (isDev) {
			error._originalData = originalError.data;
			error._originalMessage = originalError.message;
		}

		error.message = 'Your query has errors';
	} else if (errorType === 'GraphQLError' && _lodash2.default.isString(message)) {
		let matches;
		matches = message.match(/Unknown argument "([a-zA-Z0-9_$.-]+)"/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `Unknown Argument ${matches[1]}`,
				keyword: 'required'
			};
		}

		matches = message.match(/Argument "([a-zA-Z0-9_$.-]+)" has invalid/);
		if (matches) {
			error.fields[matches[1]] = {
				message: 'Invalid Value',
				keyword: 'required'
			};
		}

		matches = message.match(/Cannot query field "([a-zA-Z0-9_$.-]+)" on/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `Field ${matches[1]} does not exist`,
				keyword: 'required'
			};
		}

		matches = message.match(/argument "([a-zA-Z0-9_$.-]+)" of type ".*?" is required/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `${matches[1]} is required`,
				keyword: 'required'
			};
		}
	} else {
		if (isDev) {
			error._originalMessage = error.message;
		}

		error.message = 'Server error';
		error.fields.global = {
			message: error.message,
			keyword: 'internal'
		};
	}

	return error;
}

exports.formatError = formatError;
exports.humanizeError = humanizeError;