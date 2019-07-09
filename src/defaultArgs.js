const pagingArgs = {
	first: {
		type: 'Int',
		description: 'Returns the first n elements from the list.',
	},
	after: {
		type: 'StringOrInt',
		description: 'Returns the elements in the list that come after the specified cursor or offset.',
	},
	last: {
		type: 'Int',
		description: 'Returns the last n elements from the list.',
	},
	before: {
		type: 'StringOrInt',
		description: 'Returns the elements in the list that come before the specified cursor or offset',
	},
};

const orderArgs = {
	orderBy: {
		type: 'String',
		description: 'Property by which the list should be ordered.',
	},

	orderDirection: {
		type: 'OrderDirection',
		description: 'Which direction the list should be ordered by (ascending or descending)',
		default: 'ASC',
	},
};

const sortArgs = {
	sort: {
		type: 'String',
		description: 'Property by which the list should be sorted',
	},
	order: {
		type: 'String',
		description: 'Which direction the list should be ordered by (ASC or DESC)',
	},
};

export default {
	pagingArgs,
	orderArgs,
	sortArgs,
};
