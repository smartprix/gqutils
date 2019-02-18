#! /usr/bin/env node
import _ from 'lodash';
import program from 'commander';

import {version} from '../../package.json';
import {getConfig, generateTypesFromSchema, makeSchemaFromConfig} from '../index';

let logger;
function getLogger() {
	if (logger) return logger;
	try {
		// eslint-disable-next-line global-require
		const {Oak} = require('@smpx/oak');
		logger = new Oak('gqutils');
	}
	catch (err) {
		logger = console;
	}
	return logger;
}

// TODO: generate static docs too? https://github.com/gjtorikian/graphql-docs
// TODO: generate static schema (.graphql) too with versioning? Could be useful for diffs

program
	.version(version, '-v, --version')
	.usage('types [options]')
	.description(`
Use to generate types from graphql schema
	$ gqutils types
Only build specific schema:
	$ gqutils types --schema admin
	`)
	.option('-s, --schema [name]', 'Specify schema (default: all)', undefined)
	.option('-d, --dest [dir]', 'Specify Destination Directory (default: typings/graphql)', 'typings/graphql')
	.parse(process.argv);

async function runAndExit() {
	const conf = getConfig();
	const schemaInput = (String(program.schema || '')).trim();

	let option;
	if (program.args && program.args.length > 0) {
		option = program.args[0];
	}

	if (option !== 'types') {
		getLogger().error('Invalid option');
		program.outputHelp();
		process.exit(1);
	}

	const schema = _.castArray(schemaInput || conf.schema || conf.schemas);
	try {
		const {schemas} = makeSchemaFromConfig({
			schema,
		});

		await generateTypesFromSchema(schemas, {
			outputPath: program.dest,
			contextType: conf.contextType,
			schema,
			options: conf.generateTypeOptions || {},
		});

		getLogger().info('[gqutils] Types generated');
		process.exit(0);
	}
	catch (err) {
		getLogger().error('[gqutils]', err);
		process.exit(1);
	}
}

runAndExit();
