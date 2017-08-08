# gqutils
Utilities for GraphQL

<<<<<<< HEAD
## Extra Types
You can use `JSON`, `StringOrInt` apart from `String`, `Int`, `Float`, `Boolean`, `ID`.
=======
### Extra Types
You can use `JSON`, `StringOrInt`, `Email`, `URL`, `DateTime`, `UUID`, `StringOriginal` apart from `String`, `Int`, `Float`, `Boolean`, `ID`.

`String` is automatically trimmed of whitespaces. If you want an untrimmed
string use `StringOriginal`.
>>>>>>> 876017a10be69033650f526d6a1b17f10bd8d6ac

## Functions
### `makeSchemaFromModules(modules, opts)`
Create a graphQL schema from various modules. If the module is a folder, it'll automatically require it.
```js
const modules = [
	'employee/Employee',
	'categories',
];

const {schema} = makeSchemaFromModules(modules, {
	baseFolder: `${__dirname}/lib`,
	allowUndefinedInResolve: false,
	resolverValidationOptions: {},
});
```

This function returns `{schema, pubsub, subscriptionManager}`, you can ignore
pubsub and subscriptionManager if you're not using graphql subscriptions.

Each module can either export {schema, resolvers} or {types, queries, mutations, subscriptions, resolvers}.
```
const schema = /* GraphQL */`
	# @types
	# Employee
	type Employee {
		id: ID!
		smartprixId: ID
		name: String
		email: String
		personalEmail: String
		phone: String
		emergencyPhone: String
		gender: String
		dateOfBirth: String
		dateOfJoining: String
		designation: String
		aptitudeMarks: String
		bankAccountNumber: String
		panNumber: String
		status: String
		createdAt: String
		updatedAt: String
	}

	@connection(Employee)

	# @queries
	employee(
		id: ID!
		email: String
	): Employee

	employees(
		name: String
		paging: Default
	): EmployeeConnection

	# @mutations
	saveEmployee(
		id: ID
		name: String
		email: String!
		personalEmail: String
		phone: String!
	): Employee

	deleteEmployee(
		id: ID!
	): DeletedItem

	# @subscriptions
	employeeAdded: Employee
	employeeChanged(id: ID): Employee
`;

const resolvers = {
	Query: {
		employee: getEmployee,
		employees: getEmployees,
	},
	Mutation: {
		saveEmployee,
		deleteEmployee,
	},

	// You can also declare SubscriptionFilter, SubscriptionMap & Subscription
	// For Subscription Related Things
	// SubscriptionFilter: Filter events from pubsub
	// SubscriptionMap: Map & filter pubsub events to graphql subscriptions
	// Subscription: Modify pubsub event data before sending to client
	/*
	 * SubscriptionFilter: {
	 *     employeeChanged(employee, args) {
	 *	       return employee.id === args.id;
	 *	   },
	 * },
	 * 
	 * Subscription: {
	 *     employeeAdded(employee) {
	 *	       if (employee.password) employee.password = '******';
	 *         return employee;
	 *     },
	 * },
	 */
};

export {
	schema,
	resolvers,
};
```

In schema types, queries and mutations can be separated using `# @types`, `# @queries`, `# @mutations` to mark the begninning of each section respectively.

`@connection(typeName)` can be used to automatically generate type for a relay compatible connection for pagination.

`@connection(Employee)` will automatically generate the type `EmployeeConnection`

`@paging.params` or `paging: Default` will automatically be converted to paging parameters for connection (`first`, `last`, `before`, `after`)

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

### `parseGraphqlSchema(schema)`
Given a schema which uses our custom schema language (having `@connection`, `# @types` etc.), it'll return {types, queries, mutations}

If you're using `makeSchemaFromModules`, you won't need to use this function.

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
