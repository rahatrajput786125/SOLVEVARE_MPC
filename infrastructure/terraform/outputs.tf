output "alb_dns_name" {
  description = "ALB DNS name — point your domain CNAME here"
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "ecr_api_url" {
  description = "ECR repository URL for API image"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_worker_url" {
  description = "ECR repository URL for Worker image"
  value       = aws_ecr_repository.worker.repository_url
}

output "s3_bucket_name" {
  description = "S3 bucket for assets and static HTML"
  value       = aws_s3_bucket.assets.bucket
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain for static pages"
  value       = aws_cloudfront_distribution.assets.domain_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}
