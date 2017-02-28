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

	if (!error.keyword) {
		return { message };
	}

	if (error.keyword === 'required') {
		message = `${field} is required`;
	} else if (error.keyword === 'type') {
		const type = error.params.type;
		message = `${field} should be of type ${type}`;
	} else if (error.keyword === 'format') {
		const format = error.params.format;
		message = `${field} should be a valid ${format}`;
	}

	return { message };
}

function formatError(error) {
	error.fields = {};

	if (process.env.NODE_ENV !== 'production') {
		error._stack = error.stack;
	}

	const originalError = error.originalError || error;
	const message = originalError.data || originalError.message;
	const errorType = originalError.constructor.name;

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