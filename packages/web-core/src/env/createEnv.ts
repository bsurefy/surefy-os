// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'

type EnvShape = Record<string, z.ZodType>
/** Browser variables must carry the prefix, or Next.js does not inline them. */
type ClientShape = Record<`NEXT_PUBLIC_${string}`, z.ZodType>

type Parsed<Shape extends EnvShape> = { readonly [Key in keyof Shape]: z.output<Shape[Key]> }

export interface CreateEnvOptions<Server extends EnvShape, Client extends ClientShape> {
  /** Read on the server only; the browser throws when it reads one of these. */
  server: Server
  /** `NEXT_PUBLIC_` variables, available everywhere. */
  client: Client
  /** Every variable written out literally (`process.env.NAME`), so Next.js can inline the public ones. */
  runtimeEnv: Record<keyof Server | keyof Client, string | undefined>
}

export type Env<Server extends EnvShape, Client extends ClientShape> = Parsed<Server> &
  Parsed<Client>

function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map(
    (issue) => `  ${issue.path.map(String).join('.')}: ${issue.message}`,
  )
  return ['Invalid environment variables:', ...lines].join('\n')
}

/**
 * Validates the environment once, when the module that calls it loads, so a missing or invalid
 * variable fails at startup. On the server every variable is parsed; in the browser only the
 * client ones are, and reading a server variable throws instead of returning `undefined`.
 */
export function createEnv<Server extends EnvShape, Client extends ClientShape>({
  server,
  client,
  runtimeEnv,
}: CreateEnvOptions<Server, Client>): Env<Server, Client> {
  const isServer = typeof window === 'undefined'
  const result = z.object(isServer ? { ...server, ...client } : client).safeParse(runtimeEnv)
  if (!result.success) throw new Error(formatIssues(result.error))

  const values = result.data as Env<Server, Client>
  if (isServer) return values

  return new Proxy(values, {
    get(target, property, receiver) {
      if (typeof property === 'string' && property in server)
        throw new Error(
          `Environment variable ${property} is server-only and cannot be read in the browser`,
        )
      return Reflect.get(target, property, receiver) as unknown
    },
  })
}
