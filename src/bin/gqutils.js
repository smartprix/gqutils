#! /usr/bin/env node
import _ from 'lodash';
import program from 'commander';

import {version} from '../../package.json';
import {makeSchemaFromModules, generateTypesFromSchema} from '../index';

const confFile = `${process.cwd()}/gqutils`;
const packageFile = `${process.cwd()}/package.json`;

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
	let conf = {};
	const schema = (String(program.schema || '')).trim();
	let option;

	if (program.args && program.args.length > 0) {
		option = program.args[0];
	}

	try {
		conf = require(confFile); // eslint-disable-line
	}
	catch (e) {
		try {
			conf = require(packageFile)['gqutils']; // eslint-disable-line
			if (!conf || _.isEmpty(conf)) throw new Error('No config in package.json');
		}
		catch (err) {
			getLogger().log('[gqutils] Conf not found or error in config', e, err);
			process.exit(1);
			conf = {};
		}
	}

	if (option !== 'types') {
		getLogger().error('Invalid option');
		program.outputHelp();
		process.exit(1);
	}

	try {
		const {schemas} = makeSchemaFromModules(conf.modules, {
			baseFolder: conf.baseFolder,
			schema: _.castArray(schema || conf.schema || conf.schemas),
			allowUndefinedInResolve: conf.allowUndefinedInResolve,
			defaultSchemaName: conf.defaultSchemaName,
			resolverValidationOptions: conf.resolverValidationOptions || {},
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
