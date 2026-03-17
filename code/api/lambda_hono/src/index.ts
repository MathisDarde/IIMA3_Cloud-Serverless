import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import users from './routes/users'
import auth from './routes/auth'

export const app = new Hono()

app.get('/', (c) => c.json({ message: 'API is running' }))
app.route('/users', users)
app.route('/auth', auth)

export const handler = handle(app)
