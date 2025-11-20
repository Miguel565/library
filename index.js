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
        auth.substring(7), process.env.JWT_SECRET
      )
      const currentUser = await User.findById(decodedToken.id)
      return { currentUser }
    }
  }
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})
