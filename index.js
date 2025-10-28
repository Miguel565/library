const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { GraphQLError } = require('graphql')
const jwt = require('jsonwebtoken')

const mongoose = require('mongoose')
require('dotenv').config()

mongoose.set('strictQuery', false)

const Book = require('./models/books')
const Author = require('./models/authors')
const User = require('./models/users')

const MONGODB_URI = process.env.MONGODB_URI

console.log('Connnecting to MongoDB...')

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB!')
  })
  .catch((error) => {
    console.error('error connection to MongoDB: ', error.message)
  })

let authors = [
  {
    name: 'Robert Martin',
    id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
    born: 1963
  },
  {
    name: 'Fyodor Dostoevsky',
    id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
    born: 1821
  },
  {
    name: 'Joshua Kerievsky', // birthyear not known
    id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
  },
  {
    name: 'Sandi Metz', // birthyear not known
    id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
  },
]

let books = [
  {
    title: 'Clean Code',
    published: 2008,
    author: 'Robert Martin',
    id: "afa5b6f4-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring']
  },
  {
    title: 'Agile software development',
    published: 2002,
    author: 'Robert Martin',
    id: "afa5b6f5-344d-11e9-a414-719c6709cf3e",
    genres: ['agile', 'patterns', 'design']
  },
  {
    title: 'Refactoring, edition 2',
    published: 2018,
    author: 'Martin Fowler',
    id: "afa5de00-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring']
  },
  {
    title: 'Refactoring to patterns',
    published: 2008,
    author: 'Joshua Kerievsky',
    id: "afa5de01-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring', 'patterns']
  },
  {
    title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
    published: 2012,
    author: 'Sandi Metz',
    id: "afa5de02-344d-11e9-a414-719c6709cf3e",
    genres: ['refactoring', 'design']
  },
  {
    title: 'Crime and punishment',
    published: 1866,
    author: 'Fyodor Dostoevsky',
    id: "afa5de03-344d-11e9-a414-719c6709cf3e",
    genres: ['classic', 'crime']
  },
  {
    title: 'Demons',
    published: 1872,
    author: 'Fyodor Dostoevsky',
    id: "afa5de04-344d-11e9-a414-719c6709cf3e",
    genres: ['classic', 'revolution']
  },
]

const typeDefs = `
  type Book {
    title: String!
    author: Author!
    published: Int!
    genres: [String!]!
    id: ID!
  }

  type Author {
    name: String!
    born: Int
    bookCount: Int!
    id: ID!
  }

  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
    me: User!
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ): Book!
    editBorn(
      name: String!
      born: Int!
    ): Author!
    createUser(
      username: String!
      favoriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
  }
`

const resolvers = {
  Query: {
    bookCount: () => Book.collection.countDocuments(),

    authorCount: () => Author.collection.countDocuments(),

    allBooks: (root, args) => {
      let result = books
      if (args.author) {
        result = result.filter(book => book.author === args.author)
      }
      if (args.genre) {
        result = result.filter(book => book.genres.includes(args.genre))
      }
      return result
    },

    allAuthors: async () => {
      const authorsFromDb = await Author.find({})
      const counts = await Book.aggregate([
        { $group: { _id: "$author", count: { $sum: 1 } } }
      ])
      const countMap = counts.reduce((m, c) => { m[c._id] = c.count; return m }, {})
      return authorsFromDb.map(a => ({
        name: a.name,
        born: a.born,
        id: a._id.toString(),
        bookCount: countMap[a.name] || 0
      }))
    },

    me: (root, args, context) => {
      return context.currentUser
    }
  },

  Book: {
    author: async (root) => {
      return await Author.findOne({ name: root.author })
    }
  },

  Mutation: {
    addBook: async (root, args, context) => {
      const book = new Book({ ...args })

      const currentUser = context.currentUser

      if (!currentUser) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'BAD_USER_INPUT' }
        })
      }

      try {
        let author = await Author.findOne({ name: args.author })
        if (!author) {
          author = new Author({ name: args.author })
          await author.save()
        }
        await book.save()
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.title
          }
        })
      }
      return book
    },

    editBorn: async (root, args, context) => {
      const author = await Author.findOne({ name: args.name })

      const currentUser = context.currentUser

      if (!currentUser ) {
        throw new GraphQLError('Not authenticated', {
          extensions: { code: 'BAD_USER_INPUT' }
        })
      } else if (!author) return null

      try {
        author.born = args.born
        author.save()
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.author
          }
        })
      }

      return author
    },

    createUser: async (root, args) => {
      const user = new User({ ...args })

      return await user.save()
        .catch(error => {
          throw new GraphQLError('Creating the user failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.username,
              error
            }
          })
        })
    },

    login: async (root, args) => {
      const user = new User.findOne({ username: args.username })

      if (!user || args.password !== 'secret') {
        throw new GraphQLError('Wrong credentials', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.username,
            error
          }
        })
      }

      const userToken = {
        username: user.username,
        id: user_id.toString(),
      }

      return { value: jwt.sign(userToken, process.env.JWT_SECRET) }
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

const PORT = process.env.PORT || 4000

startStandaloneServer(server, {
  listen: { port: PORT },
  context: async ({ req, res }) => {
    const auth = req ? req.headers.authorization : null
    if (auth && auth.startsWith('Bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(7), process.env.JWT_SECRET
      )
      const currentUser = await User.findById(decodedToken.id)
      return { currentUser }
    }
  }
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
}).catch((err) => {
  console.error('Error starting server: ', err)
  process.exit(1)
})
