import path from 'path';
import _ from 'lodash';
import {PubSub} from 'graphql-subscriptions';
import {makeSchemas} from './Schema';

function makeSchemaFromModules(modules, opts = {}) {
	const schemas = [];
	const resolvers = {};

	modules.forEach((folder) => {
		let mod;
		if (typeof folder === 'string') {
			folder = path.resolve(opts.baseFolder || '', folder);
			mod = require(folder);
		}
		else {
			mod = folder;
		}

		if (mod.schema) schemas.push(mod.schema);
		if (mod.resolvers) _.merge(resolvers, mod.resolvers);
	});

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
export {makeSchemaFromModules, generateTypesFromSchema};
