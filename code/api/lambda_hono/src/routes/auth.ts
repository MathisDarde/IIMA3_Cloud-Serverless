import { Hono } from 'hono'
import { login } from '../../../../domain/aws_cognito.service'

const auth = new Hono()

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  const tokens = await login(email, password)
  return c.json({
    access_token: tokens.AccessToken,
    id_token: tokens.IdToken,
    refresh_token: tokens.RefreshToken,
  })
})

export default auth
