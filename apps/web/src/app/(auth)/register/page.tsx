"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "@/components/ui/toaster";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  Input,
  Label,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// 🟡 Fix 4

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  orgName: z.string().min(2, "Organization name required"),
});

type FormData = z.infer<typeof schema>;

// 🔴 Fix 1: refreshToken add kiya
interface RegisterResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  // 🟡 Fix 3: Already logged in → dashboard redirect
  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, router]);

  // 🟡 Fix 5: defaultValues add kiye
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      orgName: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      apiPost<RegisterResponse>("/auth/register", data),
    onSuccess: (res) => {
      setAuth(res.token, res.refreshToken, res.user, res.org);
      router.replace("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: "Registration failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Start generating SEO pages at scale</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                autoComplete="name"         // 🔴 Fix 2
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization</Label>
              <Input
                id="orgName"
                placeholder="Acme Inc."
                autoComplete="organization" // 🔴 Fix 2
                {...register("orgName")}
              />
              {errors.orgName && (
                <p className="text-xs text-destructive">{errors.orgName.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"          // 🔴 Fix 2
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"   // 🔴 Fix 2
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" loading={mutation.isPending}>
            Create account
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-primary hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}