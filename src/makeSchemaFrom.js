
import path from 'path';
import fs from 'fs';
import _ from 'lodash';
import {PubSub} from 'graphql-subscriptions';
import {makeSchemas} from './Schema';

function makeSchemaFromObjects(schemas, resolvers, opts = {}) {
	const defaultSchemaName = opts.defaultSchemaName || 'default';

	const graphqlSchemas = makeSchemas(schemas, resolvers, {
		schema: opts.schema || opts.schemas || [],
		defaultSchemaName,
		logger: opts.logger || console,
		allowUndefinedInResolve: opts.allowUndefinedInResolve || false,
		resolverValidationOptions: opts.resolverValidationOptions || {},
	});

	const pubsub = new PubSub();

	pubsub.out = function (key, message) {
		pubsub.publish('output', {key, message});
	};

	return {
		schemas: graphqlSchemas,
		schema: graphqlSchemas,
		defaultSchema: graphqlSchemas[defaultSchemaName],
		pubsub,
		data: _.mapValues(graphqlSchemas, schema => schema._data),
	};
}

function makeSchemaFromModules(modules, opts = {}) {
	const schemas = [];
	const resolvers = {};

	modules.forEach((folder) => {
		let mod;
		if (typeof folder === 'string') {
			folder = path.resolve(opts.baseFolder || '', folder);
			// eslint-disable-next-line global-require, import/no-dynamic-require
			mod = require(folder);
		}
		else {
			mod = folder;
		}

		if (mod.schema) schemas.push(mod.schema);
		if (mod.resolvers) _.merge(resolvers, mod.resolvers);
	});

	return makeSchemaFromObjects(schemas, resolvers, opts);
}

/**
 * make a graphql schema from a directory by reading all schema & resolvers from it
 * @param {string} directory
 * @param {object} [opts={}]
 */
function makeSchemaFromDirectory(directory, opts = {}) {
	const schemas = [];
	const resolvers = {};

	if (!directory.startsWith('/')) {
		throw new Error('absolute path should be given as directory');
	}

	const terms = '(schema|resolvers)';
	const ws = '\\s*';
	const quote = '("|\')';
	const regex = new RegExp([
		`^export${ws}\\{${ws}${terms}${ws}(:|,)`,
		`^export${ws}${terms}${ws}from`,
		`^module\\.exports${ws}=${ws}\\{${ws}${terms}${ws}(:|,)`,
		`^exports\\.${terms}${ws}=`,
		// babel output
		`^Object\\.defineProperty${ws}\\(${ws}exports${ws},${ws}${quote}${terms}${quote}${ws},`,
	].map(r => `(${r})`).join('|'), 'm');

	const processFile = (file) => {
		// ignore non-js file
		if (!file.endsWith('.js')) return;

		let contents;
		try {
			contents = fs.readFileSync(file);
		}
		catch (e) {
			// file does not exist
			if (file.includes('index.js') || file.includes('graphql.js')) {
				// forgive index.js & graphql.js files, as they might not exist inside directories
				return;
			}

			throw e;
		}

		// find if the file has a schema or resolver
		// NOTE: we can't require the file directly as it might create un-necessary side effects
		// only supports exports of type
		//   export {schema}
		//   export schema from
		//   module.exports = {schema}
		//   exports.schema =
		//   Object.defineProperty(exports, "schema",
		if (!regex.test(contents)) return;

		// eslint-disable-next-line global-require, import/no-dynamic-require
		const mod = require(file);
		if (mod.schema) schemas.push(mod.schema);
		if (mod.resolvers) _.merge(resolvers, mod.resolvers);
	};

	const files = fs.readdirSync(directory);
	files.sort();

	files.forEach((file) => {
		file = path.join(directory, file);
		const stat = fs.statSync(file);

		if (stat && stat.isDirectory()) {
			// file is a directory
			// read the index.js file
			processFile(path.join(file, 'index.js'));
			// also read the graphql.js & graphql/index.js file
			processFile(path.join(file, 'graphql.js'));
			processFile(path.join(file, 'graphql/index.js'));
		}
		else {
			processFile(file);
		}
	});

	return makeSchemaFromObjects(schemas, resolvers, opts);
}

function getConfig() {
	const confFile = `${process.cwd()}/gqutils`;
	const packageFile = `${process.cwd()}/package.json`;

	let conf;
	try {
		conf = require(confFile); // eslint-disable-line
	}
	catch (e) {
		conf = require(packageFile)['gqutils']; // eslint-disable-line
		if (!conf || _.isEmpty(conf)) throw new Error('No config in package.json');
	}

	return conf;
}

function makeSchemaFromConfig(opts = {}) {
	const conf = getConfig();
	const finalOpts = _.merge({}, conf, opts);
	finalOpts.schemas = _.castArray(opts.schema || opts.schemas || conf.schema || conf.schemas);

	// convert relative path to absolute
	if (finalOpts.schemaDirectory && !finalOpts.schemaDirectory.startsWith('/')) {
		finalOpts.schemaDirectory = path.join(process.cwd(), finalOpts.schemaDirectory);
	}

	if (finalOpts.modules) {
		return makeSchemaFromModules(finalOpts.modules, finalOpts);
	}
	if (finalOpts.schemaDirectory) {
		return makeSchemaFromDirectory(finalOpts.schemaDirectory, finalOpts);
	}

	throw new Error('`modules` or `schemaDirectory` option not found in config');
}

export {
	makeSchemaFromObjects,
	makeSchemaFromModules,
	makeSchemaFromDirectory,
	makeSchemaFromConfig,
	getConfig,
};
