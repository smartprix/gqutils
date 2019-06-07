import path from 'path';
import _ from 'lodash';

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
export * from './makeSchemaFrom';
export * from './Gql';
export {
	generateTypesFromSchema,
};
