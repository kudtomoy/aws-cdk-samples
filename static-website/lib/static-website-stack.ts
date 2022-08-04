import { Stack, StackProps, RemovalPolicy, Lazy } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as path from 'path'

export class StaticWebsiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const recordName = ssm.StringParameter.valueFromLookup(
      this,
      '/static-website/record-name'
    )
    const domainName = ssm.StringParameter.valueFromLookup(
      this,
      '/static-website/domain-name'
    )
    const certificateArn = ssm.StringParameter.valueFromLookup(
      this,
      '/static-website/certificate-arn'
    )

    const bucket = new s3.Bucket(this, 'Bucket', {
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'OriginAccessIdentity'
    )

    const bucketPolicyStatement = new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      effect: iam.Effect.ALLOW,
      principals: [
        new iam.CanonicalUserPrincipal(
          originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
        ),
      ],
      resources: [`${bucket.bucketArn}/*`],
    })

    bucket.addToResourcePolicy(bucketPolicyStatement)

    const rewriteUrlFunction = new cloudfront.Function(
      this,
      'RewriteUrlFunction',
      {
        functionName: 'rewrite-url',
        code: cloudfront.FunctionCode.fromFile({
          filePath: 'functions/rewrite-url/index.js',
        }),
      }
    )

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        origin: new cloudfrontOrigins.S3Origin(bucket, {
          originAccessIdentity,
        }),
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: rewriteUrlFunction,
          },
        ],
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      certificate: acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        Lazy.string({ produce: () => certificateArn })
      ),
      domainNames: [recordName],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    })

    new s3Deployment.BucketDeployment(this, 'BucketDeployment', {
      sources: [
        s3Deployment.Source.asset(path.resolve(__dirname, '../web/public')),
      ],
      destinationBucket: bucket,
      distribution: distribution,
      distributionPaths: ['/*'],
    })

    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName,
    })

    const propsForRoute53Records = {
      zone: hostedZone,
      recordName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
    }

    new route53.ARecord(this, 'ARecord', propsForRoute53Records)
    new route53.AaaaRecord(this, 'AaaaRecord', propsForRoute53Records)
  }
}
