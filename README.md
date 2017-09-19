# gqutils
Utilities for GraphQL

### Extra Types
You can use `JSON`, `StringOrInt`, `Email`, `URL`, `DateTime`, `UUID`, `StringOriginal` apart from `String`, `Int`, `Float`, `Boolean`, `ID`.

`String` is automatically trimmed of whitespaces. If you want an untrimmed string use `StringOriginal`.

## Functions
### `makeSchemasFromModules(modules, opts)`
Create a graphQL schema from various modules. If the module is a folder, it'll automatically require it.
```js
const modules = [
	'employee/Employee',
	'Category',
];

const {schemas} = makeSchemasFromModules(modules, {
	baseFolder: `${__dirname}/lib`,
	schema: ['admin', 'public'],
	allowUndefinedInResolve: false,
	resolverValidationOptions: {},
});

// schemas will be {default: GraphqlSchema, admin: GraphqlSchema, public: GraphqlSchema}
```

This function returns `{schemas, pubsub}`, you can ignore pubsub if you're not using graphql subscriptions.

Each module can either export `{schema, resolvers}` or the `{schema}` can contain resolvers in itself.

#### Concept of Schemas
`makeSchemasFromModules`, returns multiple graphql schemas. You have to list all possible schema names in the `schema` option. Each graphql schema will only contain the types/queries/mutations etc, that have listed that schema name in their `schema` option.

To be included in a particular schema, the following must be true:
* The schema name is defined in the `schema` option
* The schema name is also defined in the parent's `schema` option

eg. if a query returns a particular type, then it'll not be included in a schema the that type doesn't have the schema name in its `schema` option. In short, it works like intersection of `schema` options of parent and child.

In case of fields, args & values, if you haven't defined `schema` option, it'll be included in all schemas. So, generally speaking in case of args & values, only define `schema` when you want them to exclude from a particular schema and that schema is listed in its parent's `schema`.

Regardless of the schema option, a default schema named `default` contains all the types/fields.

### Example Schema
```js
const Employee = {
	graphql: 'type',
	fields: {
		id: 'ID!',
		smartprixId: 'ID',
		name: 'String',
		email: 'String',
		phone: 'String',
		createdAt: 'DateTime',
		updatedAt: 'DateTime',
	},
	schema: ['admin', 'public'],
	relayConnection: true,
};

const getEmployee = {
	graphql: 'query',
	name: 'employee',
	type: 'Employee',
	args: {
		$default: ['id', 'email'],
	},
	schema: ['admin', 'public'],
};

const getEmployees = {
	graphql: 'query',
	name: 'employess',
	type: 'EmployeeConnection',
	args: {
		$default: ['name', '$paging'],
	},
	schema: ['admin', 'public'],
};

const saveEmployee = {
	graphql: 'mutation',
	args: {
		$default: ['id', 'name', 'email', 'phone'],
		smartprixId: {
			type: 'ID',
			default: 0,
			schema: ['admin'],
		},
	},
	schema: ['admin'],
};

const deleteEmployee = {
	graphql: 'mutation',
	args: {
		id: 'ID!',
	},
	schema: ['admin'],
};

const employeeAdded = {
	graphql: 'subscription',
	type: 'Employee',
};

const employeeChanged = {
	graphql: 'subscription',
	type: 'Employee',
	args: {
		'id': 'ID!',
	},
};

const resolvers = {
	Query: {
		employee: getEmployee,
		employees: getEmployees,
	},

	Mutation: {
		saveEmployee,
		deleteEmployee,
	},

	// You can also declare Subscription
	// For Subscription Related Things
	// Every resolver can contain {subscribe, filter, resolve}
	// Only subscribe is required. Rest are optional.
	// subscribe: return an async iterator that will contain data to be returned to the client
	// filter: Filter events from pubsub async iterator
	// resolve: Modify event data before sending to client
	Subscription: {
		employeeAdded: {
			subscribe() {
				return pubsub.asyncIterator('employeeAdded');
			},

			resolve(employee) {
				if (employee.password) employee.password = '******';
				return employee;
			},
		},

		employeeChanged: {
			subscribe() {
				return pubsub.asyncIterator('employeeChanged');
			},

			filter(employee, args) {
				return employee.id === args.id;
			},

			resolve(employee) {
				if (employee.password) employee.password = '******';
				return employee;
			},
		},
	},
};

export {
	schema: {
		Employee,
		getEmployee,
		getEmployeees,
		saveEmployee,
		deleteEmployee,
		employeeAdded,
		employeeChanged,
	},
	resolvers,
};
```

## Language Reference

graphql option reference
* `type`: for object type
* `input`: for input object type
* `union`: for union
* `interface`: for interface
* `enum`: for enum
* `scalar`: for scalars
* `query`: for root query
* `mutation`: for root mutation
* `subscription`: for root subscription
### Types
Defined with `graphql: type`
```js
const Employee = {
	// graphql = type means it's a graphql type
	graphql: 'type',

	// name (optional): name of the type
	// if name is not given it'll be taken from the object where it is exported
	// eg. export {schema: {Employee}}
	name: 'Employee',

	// description (optional): description that'll displayed in docs
	description: 'An employee',

	// interfaces (optional): interfaces this type implements
	interfaces: ['Person'],

	// relayConnection (optional, default=false): generate a relay connection type automatically
	// if this is true, a connection type (EmployeeConnection here) will be added to the schema
	relayConnection: true,

	// schema (required): schemas that this type is available in
	// if schema is not given, it won't be available in any schema
	schema: ['admin', 'public'],

	// fields (required): fields of the type
	// see Fields definition for more details
	fields: {
		id: 'ID!',
		name: 'String',
	},
}
```

### Input Types
Defined with `graphql: input`

Its denition is mostly same as type.
```js
const EmployeeInput = {
	// graphql = input means it's a graphql input type
	graphql: 'input',

	// name (optional): name of the input type
	// if name is not given it'll be taken from the object where it is exported
	// eg. export {schema: {EmployeeInput}}
	name: 'EmployeeInput',

	// description (optional): description that'll displayed in docs
	description: 'An employee input',

	// schema (required): schemas that this input type is available in
	// if schema is not given, it won't be available in any schema
	schema: ['admin', 'public'],

	// fields (required): fields of the input type
	// see Fields definition for more details
	fields: {
		id: 'ID!',
		name: 'String',
	},
}
```

### Unions
Defined with `graphql: union`
```js
const User = {
	// graphql = union means it's a graphql union
	graphql: 'union',

	// name (optional): name of the union
	// if name is not given it'll be taken from the object where it is exported
	// eg. export {schema: {User}}
	name: 'User',

	// description (optional): description that'll displayed in docs
	description: 'An employee or a guest',

	// schema (required): schemas that this union is available in
	// if schema is not given, it won't be available in any schema
	schema: ['admin', 'public'],

	// types (required): types that this union contains
	types: ['Employee', 'Guest'],

	// resolveType (optional): function for determining which type is actually used when the value is resolved
	resolveType: (value, info) => 'Type',
}
```

### Interface
Defined with `graphql: interface`
```js
const Vehicle = {
	// graphql = interface means it's a graphql iterface
	graphql: 'interface',

	// name (optional): name of the interface
	// if name is not given it'll be taken from the object where it is exported
	// eg. export {schema: {Vehicle}}
	name: 'Vehicle',

	// description (optional): description that'll displayed in docs
	description: 'A vehicle (can be a car or bike or bus etc)',

	// schema (required): schemas that this interface is available in
	// if schema is not given, it won't be available in any schema
	schema: ['admin', 'public'],

	// fields (required): fields of the interface
	// see Fields definition for more details
	fields: {
		id: 'ID!',
		name: 'String',
	},

	// resolveType (optional): function for determining which type is actually used when the value is resolved
	resolveType: (value, info) => 'Type',
}
```

### Enum
Defined with `graphql: enum`
```js
const Color = {
	// graphql = enum means it's a graphql enum
	graphql: 'enum',

	// name (optional): name of the enum
	// if name is not given it'll be taken from the object where it is exported
	// eg. export {schema: {Vehicle}}
	name: 'Color',

	// description (optional): description that'll displayed in docs
	description: 'color you know C-O-L-O-R',

	// schema (required): schemas that this enum is available in
	// if schema is not given, it won't be available in any schema
	schema: ['admin', 'public'],

	// values (required): enum values
	// see Field definition for more details
	values: {
		// both name and value are RED,
		RED: 'RED',
		// name is WHITE, value is white
		WHITE: 'white',
		// name is BLACK, value is 0
		BLACK: 0,
		// you can also define this as an object
		BLUE: {
			// value (optional): if value is not given, name is used as value
			value: 'blue',

			// description (optional): description that'll displayed in docs
			description: 'the best color obviously',

			// deprecationReason (optional): reason for deprecation
			deprecationReason: 'too much blue is happening',

			// schema (optional): schemas that this value is available in
			// if schema is not given, it will be available in its parent's schemas
			schema: ['admin'],
		},
	},

	// resolveType (optional): function for determining which type is actually used when the value is resolved
	resolveType: (value, info) => 'Type',
}
```

### Scalar
Defined with `graphql: scalar`

You need to give either `resolve` or `serialize, parseValue, parseLiteral`
```js
const URL = {
	// graphql = scalar means it's a graphql scalar
	graphql: 'scalar',

	// name (optional): name of the scalar
	// if name is not given it'll be taken from the object where it is exported
	// eg. export {schema: {URL}}
	name: 'URL',

	// description (optional): description that'll displayed in docs
	description: 'A url',

	// schema (required): schemas that this scalar is available in
	// if schema is not given, it won't be available in any schema
	schema: ['admin', 'public'],

	// resolve (required/optional): Already defined graphql scalar you can resolve it with
	// if resolve is not given then, serialize, parseValue, parseLiteral must be given
	resolve: GraphQLURL

	// serialize (optional, default=identity function): send value to client
	serialize: (value) => serializedValue,

	// parseValue(optional, default=identity function): parse value coming from client
	parseValue: (value) => parsedValue,

	// parseLiteral (required/optional): parse ast tree built after value coming from client
	parseLiteral: (ast) => parsedValue,
}
```

### Query / Mutation / Subscription
* Defined as `graphql: query` => for Query
* Defined as `graphql: mutation` => for Mutation
* Defined as `graphql: subscription` => for Subscription
```js
const getEmployees = {
	// graphql = query means it's a graphql query
	graphql: 'query',

	// name (optional): name of the query
	// if name is not given it'll be taken from the object where it is exported
	// eg. export {schema: {employees: getEmployees}}
	name: 'employees',

	// description (optional): description that'll displayed in docs
	description: 'Get employees',

	// type (required): type that this query returns
	type: 'EmployeeConnection',

	// schema (optional): schemas that this type is available in
	// if schema is not given, it will be available in its parent's schemas (Employee's)
	schema: ['admin', 'public'],

	// resolve (optional): resolver for this query
	// this can also be defined in resolvers
	resolve: (root, args, ctx, info) => {}

	// args (optional): arguments of the query
	// see Fields / Args definition for more details
	args: {
		$default: ['id', '$paging'],
		name: 'String',
		email: 'String',
	},
}
```

### Fields / Args
```js
const Employee = {
	graphql: 'type',
	name: 'Employee',

	// fields
	fields: {
		// key is field's name, value is field's type
		id: 'ID!',

		// name is email, type is String
		email: 'String',

		// you can use ! for non null, and [] for list same as graphql
		emails: '[String!]',

		// you can also define it as an object
		teams: {
			// type (required): type of the field
			type: 'TeamConnection',

			// description (optional): description that'll displayed in docs
			description: 'teams that the employee belongs to',

			// default (optional): default value of the field
			default: 'yo',

			// schema (optional): schemas that this type is available in
			// if schema is not given, it will be available in its parent's schemas (Employee's)
			schema: ['admin'],

			// deprecationReason (optional): reason why this field was deprecated
			deprecationReason: 'teams are so old fashioned',

			// resolve (optional): resolver for this field
			// this can also be defined in resolvers
			resolve: (root, args, ctx, info) => {}

			// args (optional): arguments that this field takes
			// NOTE: args are defined as the same way fields are
			args: {
				// $default is special
				// fields defined in $default will be taken from parent's (TeamConnection's) fields
				// fields in $default will not have required condition even if mentioned in the type
				// to enforce required condition add `!` to the field's name
				// $paging is used for paging parameters (first, after, last, before)
				// $order is used for order parameters (orderBy & orderDirection)
				$default: ['id', 'phone!', '$paging', '$order'],

				// rest of the parameters are defined in same way as field definition
				search: 'String',
				status: {
					type: 'String',
					default: 'active',
					schema: ['admin'],
				},
			},
		},
	}
}
```

### `getConnectionResolver(query, args)`
Given a query (xorm query) and its arguments, it'll automatically generate a resolver for a relay connection.
```js
async function getEmployees(root, args) {
	const query = Employee.query();
	if (args.name) {
		query.where('name', 'like', `%${args.name}%`);
	}

	return getConnectionResolver(query, args);
}
```

### `formatError`
Use this function to format the errors sent to the client, so that you can display them in a user friendly way.

It'll add `fields` to each error, which you can use to display errors on front end.

```js
import {formatError} from 'gqutils';

route.post('/api', apolloKoa({
	schema: graphqlSchema,
	formatError: formatError,
}));
```
