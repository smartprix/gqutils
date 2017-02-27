'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
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
		if (_.isString(message)) {
			error.fields.global = message;
		} else if (_.isPlainObject(message)) {
			_.forEach(message, (value, key) => {
				if (_.isString(value)) {
					error.fields[key] = {
						message: value
					};
				} else if (_.isArray(value)) {
					error.fields[key] = humanizeError(key, value[0]);
				} else {
					error.fields[key] = value;
				}
			});
		}

		error.message = 'Your query has errors';
	} else if (errorType === 'GraphQLError' && _.isString(message)) {
		let matches;
		matches = message.match(/Unknown argument "([a-zA-Z0-9_$.-]+)"/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `Unknown Argument ${matches[1]}`
			};
		}

		matches = message.match(/Argument "([a-zA-Z0-9_$.-]+)" has invalid/);
		if (matches) {
			error.fields[matches[1]] = {
				message: 'Invalid Value'
			};
		}

		matches = message.match(/Cannot query field "([a-zA-Z0-9_$.-]+)" on/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `Field ${matches[1]} does not exist`
			};
		}

		matches = message.match(/argument "([a-zA-Z0-9_$.-]+)" of type ".*?" is required/);
		if (matches) {
			error.fields[matches[1]] = {
				message: `${matches[1]} is required`
			};
		}
	} else {
		error.message = 'Server error';
	}

	return error;
};

exports.formatError = formatError;
exports.humanizeError = humanizeError;