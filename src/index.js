import path from 'path';
import fs from 'fs';
import _ from 'lodash';
import {PubSub} from 'graphql-subscriptions';
import {makeSchemas} from './Schema';

function makeSchemaFromObjects(schemas, resolvers, opts = {}) {
	const logger = {
		log(e) {
			console.log(e);
		},
	};

	const defaultSchemaName = opts.defaultSchemaName || 'default';

	const graphqlSchemas = makeSchemas(schemas, resolvers, {
		schema: opts.schema || opts.schemas || [],
		defaultSchemaName,
		logger: opts.logger || logger,
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
 * Only supports exports of type:
 * - export {schema}
 * - export schema from
 * - module.exports = {schema}
 * - exports.schema =
 * - Object.defineProperty(exports, "schema",
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

function getConfig(opts = {}) {
	const confFile = `${process.cwd()}/gqutils`;
	const smartprixConfFile = `${process.cwd()}/sm-config`;
	const packageFile = `${process.cwd()}/package.json`;

	let conf;
	try {
		conf = require(confFile); // eslint-disable-line
	}
	catch (e) {
		try {
			conf = require(smartprixConfFile)['gqutils']; // eslint-disable-line
			if (!conf || _.isEmpty(conf)) throw new Error('No config or empty config found in common \'sm-config\'');
		}
		catch (e2) {
			try {
				conf = require(packageFile)['gqutils']; // eslint-disable-line
				if (!conf || _.isEmpty(conf)) throw new Error('No config or empty config found in package.json');
			}
			catch (e3) {
				console.error('No config found or error in config', e.message, e2.message, e3.message);
				throw new Error('No config found or error in config');
			}
		}
	}

	if (_.isEmpty(opts)) return conf;
	return _.merge({}, conf, opts);
}

function makeSchemaFromConfig(opts = {}) {
	const conf = getConfig(opts);
	conf.schemas = _.castArray(opts.schema || opts.schemas || conf.schema || conf.schemas);
	// convert relative path to absolute
	if (conf.schemaDirectory && !conf.schemaDirectory.startsWith('/')) {
		conf.schemaDirectory = path.join(process.cwd(), conf.schemaDirectory);
	}

	if (conf.modules) {
		return makeSchemaFromModules(conf.modules, conf);
	}
	if (conf.schemaDirectory) {
		return makeSchemaFromDirectory(conf.schemaDirectory, conf);
	}

	throw new Error('`modules` or `schemaDirectory` option not found in config');
}

async function generateTypesFromSchema(graphqlSchemas, {contextType = 'any', outputPath, schema, options = {}} = {}) {
	let generateTypeScriptTypes;
	try {
		// This is done this way so that those who don't need the cli don't need to install typescript
		// eslint-disable-next-line
		({generateTypeScriptTypes} = require('graphql-schema-typescript'));
	}
	catch (err) {
		throw new Error('You need to install \'typescript\' as a dependency');
	}

	const folder = outputPath || `${process.cwd()}/typings/graphql`;

	schema = _.castArray(schema);

	return Promise.all(Object.keys(graphqlSchemas).map(async (schemaName) => {
		if (schema.length && !schema.includes(schemaName)) return;

		/** @type {import('graphql-schema-typescript').GenerateTypescriptOptions} */
		const defaultOptions = {
			global: true,
			tabSpaces: 4,
			// https://github.com/dangcuuson/graphql-schema-typescript/issues/17
			// asyncResult: true
		};
		await generateTypeScriptTypes(
			graphqlSchemas[schemaName],
			path.join(folder, `${schemaName}.d.ts`),
			_.merge(defaultOptions, options, {
				namespace: `GraphQl.${schemaName}`,
				contextType,
			}),
		);
	}));
}

export * from './errors';
export * from './connection';
export * from './Schema';
export {
	makeSchemaFromObjects,
	makeSchemaFromModules,
	makeSchemaFromDirectory,
	makeSchemaFromConfig,
	getConfig,
	generateTypesFromSchema,
};
