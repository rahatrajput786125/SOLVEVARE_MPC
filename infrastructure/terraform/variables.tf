variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name prefix for all resources"
  type        = string
  default     = "mpc"
}

variable "environment" {
  description = "Environment: production | staging"
  type        = string
  default     = "production"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t3.medium"
  # Scale up: db.r6g.large (8GB RAM) for 1M+ pages
}

variable "db_replica_instance_class" {
  description = "RDS read replica instance type"
  type        = string
  default     = "db.t3.small"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
  # Scale up: cache.r6g.large for high queue throughput
}

variable "api_task_cpu" {
  description = "ECS API task CPU units (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "api_task_memory" {
  description = "ECS API task memory in MB"
  type        = number
  default     = 1024
}

variable "worker_task_cpu" {
  description = "ECS Worker task CPU units"
  type        = number
  default     = 1024
}

variable "worker_task_memory" {
  description = "ECS Worker task memory in MB"
  type        = number
  default     = 2048
}

variable "api_desired_count" {
  description = "Number of API ECS tasks"
  type        = number
  default     = 2
}

variable "worker_desired_count" {
  description = "Number of Worker ECS tasks"
  type        = number
  default     = 3
}
