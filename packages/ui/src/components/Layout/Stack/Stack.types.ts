// SPDX-License-Identifier: AGPL-3.0-only
import type { stackVariants } from './Stack.variants'
import type { VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

export interface StackProps extends ComponentProps<'div'>, VariantProps<typeof stackVariants> {}
