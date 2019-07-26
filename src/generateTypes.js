import path from 'path';
import _ from 'lodash';
import {File} from 'sm-utils';

function getTypeStringForCustomAdditions({fragments, enums, interfaces}, schemaName) {
	let typeString = `\


import {GqlEnum, GqlFragment} from 'gqutils';

declare global {
	namespace GraphQl.${schemaName} {`;


	/** ************************** Fragment Map ************************** */
	if (!_.isEmpty(fragments)) {
		typeString += `\

		type fragments = {
			${Object.keys(fragments).map(fragmentName => `${fragmentName}: GqlFragment;`).join('\n\t\t\t')}
		};
`;
	}
	/** ************************** ----------- ************************** */


	/** **************************** Enum Map **************************** */
	if (!_.isEmpty(enums)) {
		typeString += `\

		type enums = {
			${_.map(Object.entries(enums),
		([enumName, values]) => `${enumName}: { ${Object.keys(values).map(key => `${key}: GqlEnum;`).join(' ')} }`
	).join(';\n\t\t\t')}
		};
`;
	}
	/** **************************** -------- **************************** */


	/** ********************* Interface Types string enum ********************* */
	if (!_.isEmpty(interfaces)) {
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
		const data = graphqlSchema._data || {};

		const typesFile = new File(path.join(folder, `${schemaName}.d.ts`));

		await generateTypeScriptTypes(
			graphqlSchema,
			typesFile.path,
			_.merge(defaultOptions, options, {
				namespace: `GraphQl.${schemaName}`,
				contextType,
			}),
		);

		let isEmpty = true;
		_.forEach(data, (val) => { isEmpty = _.isEmpty(val) && isEmpty });
		if (isEmpty) return;

		await typesFile.append(getTypeStringForCustomAdditions(data, schemaName));
	}));
}

export {
	// eslint-disable-next-line import/prefer-default-export
	generateTypesFromSchema,
};

