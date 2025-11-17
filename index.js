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

    allBooks: async (root, args) => {
      return await Book.find({})
        .populate('author', { name: 1, born: 1 })
        .exec()
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
      const user = await User.findOne({ username: args.username })

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
        id: user._id,
      }

      const token = jwt.sign(userToken, process.env.JWT_SECRET, { expiresIn: 60*60 })
      return { value: token }
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
    const auth = req ? req.header.authorization : null
    if (auth && auth.startsWith('Bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(8), process.env.JWT_SECRET
      )
      const currentUser = await User.findById(decodedToken.id)
      return { currentUser }
    }
  }
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
