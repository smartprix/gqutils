import {createRequire} from 'module';
import path from 'path';
import fs from 'fs/promises';

import {isEmpty, merge} from './lodash.js';

const require = createRequire(import.meta.url);

function getTypeStringForCustomAdditions({fragments, enums, interfaces}, schemaName) {
	let typeString = `\


import {GqlEnum, GqlFragment} from 'gqutils';

declare global {
	namespace GraphQl.${schemaName} {`;


	/** ************************** Fragment Map ************************** */
	if (!isEmpty(fragments)) {
		typeString += `\

		type fragments = {
			${Object.keys(fragments).map(fragmentName => `${fragmentName}: GqlFragment;`).join('\n\t\t\t')}
		};
`;
	}
	/** ************************** ----------- ************************** */


	/** **************************** Enum Map **************************** */
	if (!isEmpty(enums)) {
		const notFound = Symbol('val not found');
		typeString += `\

		type enums = {
			${Object.entries(enums).map(
		([enumName, values]) => `${enumName}: { ${
			Object
				.keys(values)
				.map((key) => {
					const val = values[key]?.value?.value ?? notFound;
					const type = val === notFound ? 'any' : typeof val;

					return `${key}: GqlEnum<${type}>;`;
				})
				.join(' ')
		} }`
	).join(';\n\t\t\t')}
		};
`;
	}
	/** **************************** -------- **************************** */


	/** ********************* Interface Types string enum ********************* */
	if (!isEmpty(interfaces)) {
		typeString += `\

		type interfaces = '${Object.keys(interfaces).join('\' | \'')}';
`;
	}
	/** ********************* -------------------------- ********************** */


	typeString += `\
	}
}
`;

	return typeString;
}

/** @type {import('graphql-schema-typescript').GenerateTypescriptOptions} */
const defaultOptions = {
	global: true,
	tabSpaces: 4,
	customScalarType: {
		JSON: 'any',
		JSONObject: 'any',
		StringOrInt: 'string | number',
		IntID: 'number',
		DateTime: 'string',
		URL: 'string',
		StringOriginal: 'string',
	},
	// https://github.com/dangcuuson/graphql-schema-typescript/issues/17
	// asyncResult: true
};

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

	schema = Array.isArray(schema) ? schema : [schema];

	return Promise.all(Object.keys(graphqlSchemas).map(async (schemaName) => {
		if (schema.length && !schema.includes(schemaName)) return;

		const graphqlSchema = graphqlSchemas[schemaName];
		const data = graphqlSchema._data || {};

		const typesFilePath = path.join(folder, `${schemaName}.d.ts`);

		await fs.mkdir(path.dirname(typesFilePath), {recursive: true});
		await generateTypeScriptTypes(
			graphqlSchema,
			typesFilePath,
			merge({}, defaultOptions, options, {namespace: `GraphQl.${schemaName}`, contextType}),
		);

		const isDataEmpty = Object.values(data).every(isEmpty);
		if (isDataEmpty) return;

		await fs.appendFile(typesFilePath, getTypeStringForCustomAdditions(data, schemaName));
	}));
}

export {
	// eslint-disable-next-line import/prefer-default-export
	generateTypesFromSchema,
};
