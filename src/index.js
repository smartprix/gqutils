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
	const regex = new RegExp([
		`^export${ws}\\{${ws}${terms}${ws}(:|,)`,
		`^export${ws}${terms}${ws}from`,
		`^module\\.exports${ws}=${ws}\\{${ws}${terms}${ws}(:|,)`,
	].map(r => `(${r})`).join('|'), 'm');

	const processFile = (file) => {
		let contents;
		try {
			contents = fs.readFileSync(file);
		}
		catch (e) {
			// file does not exist
			if (file.includes('index.js')) {
				// forgive index.js files, as they might not exist inside directories
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
		if (!regex.test(contents)) return;

		// eslint-disable-next-line global-require, import/no-dynamic-require
		const mod = require(file);
		if (mod.schema) schemas.push(mod.schema);
		if (mod.resolvers) _.merge(resolvers, mod.resolvers);
	};

	const files = fs.readdirSync(directory);
	files.forEach((file) => {
		file = path.join(directory, file);
		const stat = fs.statSync(file);

		if (stat && stat.isDirectory()) {
			// file is a directory
			// read the index.js file
			processFile(path.join(file, 'index.js'));
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

	if (finalOpts.modules) {
		return makeSchemaFromModules(finalOpts.modules, finalOpts);
	}
	if (finalOpts.schemaDirectory) {
		return makeSchemaFromDirectory(finalOpts.schemaDirectory, finalOpts);
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
