// SPDX-License-Identifier: AGPL-3.0-only
'use client'

import { FeatureGateCard } from '@surefy/ui/components/Feedback'
import { Field } from '@surefy/ui/components/Forms'
import { Section } from '@surefy/ui/components/Layout'
import { Button } from '@surefy/ui/primitives/button'
import { Input } from '@surefy/ui/primitives/input'

const SSO_COPY = {
  title: 'Single sign-on is part of SurefyOS Enterprise',
  description:
    'Let people sign in with your identity provider (SAML or OIDC), sync users with SCIM, and require SSO for everyone.',
  editionLabel: 'Enterprise',
  previewLabel: 'Preview of Single sign-on',
}

// A static picture of the gated screen: fixture text only, never real data.
function SsoPreview() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Field id="demo-sso-entity" label="Identity provider entity ID">
        <Input defaultValue="https://idp.example.test/metadata" />
      </Field>
      <Field id="demo-sso-url" label="Sign-in URL">
        <Input defaultValue="https://idp.example.test/sso" />
      </Field>
      <Button className="w-fit">Test sign-in</Button>
    </div>
  )
}

export default function FeatureGateDemo() {
  return (
    <Section title="Feature-gate card">
      <FeatureGateCard
        {...SSO_COPY}
        preview={<SsoPreview />}
        actions={
          <>
            <Button>Enter license key</Button>
            <Button variant="secondary">Compare editions</Button>
          </>
        }
      />
      <FeatureGateCard {...SSO_COPY} note="Ask an owner to upgrade" headingLevel={3} />
    </Section>
  )
}
