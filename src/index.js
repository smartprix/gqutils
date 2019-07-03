import path from 'path';
import _ from 'lodash';
import {File} from 'sm-utils';

async function generateTypesFromSchema(graphqlSchemas, {contextType = 'any', outputPath, schema, options = {}} = {}) {
	/** @type {import('graphql-schema-typescript').generateTypeScriptTypes} */
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

	const getTypeStringForFragments = ({fragments, enums}, schemaName) => `\


import {GqlEnum} from 'gqutils';

declare global {
	namespace GraphQl.${schemaName} {
		type fragments = '${Object.keys(fragments).join("' | '")}';
		type enums = {
			${_.map(Object.entries(enums),
		([enumName, values]) => `${enumName}: { ${Object.keys(values).map(key => `${key}: GqlEnum;`).join(' ')} }`
	).join(';\n\t\t\t')}
		}
	}
}
`;

	return Promise.all(Object.keys(graphqlSchemas).map(async (schemaName) => {
		if (schema.length && !schema.includes(schemaName)) return;

		/** @type {import('graphql-schema-typescript').GenerateTypescriptOptions} */
		const defaultOptions = {
			global: true,
			tabSpaces: 4,
			// https://github.com/dangcuuson/graphql-schema-typescript/issues/17
			// asyncResult: true
		};
		const graphqlSchema = graphqlSchemas[schemaName];
		const {fragments, enums} = graphqlSchema._data || {};

		const typesFile = new File(path.join(folder, `${schemaName}.d.ts`));

		await generateTypeScriptTypes(
			graphqlSchema,
			typesFile.path,
			_.merge(defaultOptions, options, {
				namespace: `GraphQl.${schemaName}`,
				contextType,
			}),
		);

		if (_.isEmpty(fragments) && _.isEmpty(enums)) return;

		await typesFile.append(getTypeStringForFragments({fragments, enums}, schemaName));
	}));
}

export * from './helpers';
export * from './connection';
export * from './Schema';
export * from './makeSchemaFrom';
export * from './Gql';
export {
	generateTypesFromSchema,
};
