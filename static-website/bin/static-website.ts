#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { StaticWebsiteStack } from '../lib/static-website-stack'

const app = new cdk.App()

new StaticWebsiteStack(app, 'StaticWebsiteStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
