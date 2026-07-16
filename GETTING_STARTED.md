# Getting Started with DI Framework

This guide will help you get started with the DI Framework - a lightweight, TypeScript-first dependency injection framework with built-in HTTP server support using modern TypeScript 5.0+ decorators.

## Prerequisites

- Node.js 18+ or later
- TypeScript 5.0+
- Basic understanding of TypeScript decorators

## Installation

```bash
# Clone or add to your project
pnpm install

# Build the framework
pnpm build
```

## Your First Application

Let's create a simple REST API step by step.

### Step 1: Create a Service

Services contain your business logic and are decorated with `@Injectable()`:

```typescript
import { Injectable } from './src';

interface User {
  id: number;
  name: string;
  email: string;
}

@Injectable()
class UserService {
  private users: User[] = [];
  private currentId = 1;

  findAll(): User[] {
    return this.users;
  }

  create(name: string, email: string): User {
    const user = { id: this.currentId++, name, email };
    this.users.push(user);
    return user;
  }
}
```

### Step 2: Create a Controller

Controllers handle HTTP requests and are decorated with `@Controller()`:

**Note**: `@Controller` automatically marks the class as injectable - no need for `@Injectable()`.

```typescript
import { 
  Controller, 
  Get, 
  Post, 
  HttpRequest, 
  HttpResponse,
  registerDependencies
} from './src';

@Controller('/users')
class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async getAllUsers(req: HttpRequest, res: HttpResponse): Promise<void> {
    const users = this.userService.findAll();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(users));
  }

  @Post()
  async createUser(req: HttpRequest, res: HttpResponse): Promise<void> {
    const { name, email } = req.body;
    const user = this.userService.create(name, email);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user));
  }
}

// Register constructor dependencies (required for DI)
registerDependencies(UserController, [UserService]);
```

### Step 3: Create a Module

Modules organize your application by grouping related components:

```typescript
import { Module } from './src';

@Module({
  controllers: [UserController],
  providers: [UserService],
})
class AppModule {}
```

### Step 4: Bootstrap the Application

Create the application and start the server:

```typescript
import { ApplicationFactory } from './src';

async function bootstrap() {
  const app = ApplicationFactory.create(AppModule);
  await app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
  });
}

bootstrap().catch(console.error);
```

### Step 5: Test Your API

```bash
# Get all users
curl http://localhost:3000/users

# Create a user
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
```

## Understanding the Type Requirements

### Route Handler Type Declaration

**Important**: When using route decorators (`@Get`, `@Post`, etc.), you **must** declare the proper function signature:

```typescript
// ✅ Correct - explicit types
@Get('/users')
async getUsers(
  request: HttpRequest,
  response: HttpResponse
): Promise<void> {
  // implementation
}

// ❌ Incorrect - missing types
@Get('/users')
async getUsers(request, response) {
  // This won't work with new TypeScript decorators
}
```

The required signature is:
```typescript
(request: HttpRequest, response: HttpResponse) => void | Promise<void>
```

### Working with Guards

Guards control access to routes. They implement the `Guard` interface:

**Note**: `@GuardDecorator()` automatically marks the class as injectable - no need for `@Injectable()`.

```typescript
import { 
  Guard, 
  GuardDecorator, 
  ExecutionContext
} from './src';

@GuardDecorator()
class AuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.getRequest();
    const token = request.headers.authorization;
    return !!token; // Simple check for demo
  }
}
```

### Applying Guards

```typescript
import { UseGuards } from './src';

@Controller('/admin')
class AdminController {
  // Apply to single route
  @UseGuards(AuthGuard)
  @Get('/dashboard')
  async dashboard(req: HttpRequest, res: HttpResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Admin dashboard' }));
  }
}

// Don't forget to register the guard in your module
@Module({
  controllers: [AdminController],
  providers: [AuthGuard],
})
class AppModule {}
```

### Multiple Guards

Guards are executed in order. All must pass:

```typescript
@UseGuards(AuthGuard, RoleGuard, PermissionGuard)
@Get('/super-admin')
async superAdmin(req: HttpRequest, res: HttpResponse): Promise<void> {
  // Only accessible if all three guards pass
}
```

## Request and Response

### Accessing Request Data

```typescript
@Post('/users')
async createUser(req: HttpRequest, res: HttpResponse): Promise<void> {
  // Body (automatically parsed JSON)
  const data = req.body;
  
  // Query parameters (?name=john&age=30)
  const name = req.query?.name;
  
  // Route parameters (/users/:id)
  const id = req.params?.id;
  
  // Headers
  const contentType = req.headers['content-type'];
}
```

### Sending Responses

```typescript
@Get('/users/:id')
async getUser(req: HttpRequest, res: HttpResponse): Promise<void> {
  const id = parseInt(req.params?.id || '0');
  const user = this.userService.findById(id);
  
  if (!user) {
    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'User not found' }));
    return;
  }
  
  // 200 OK
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(user));
}
```

## Dynamic Routes

Use `:param` syntax for dynamic route segments:

```typescript
@Get('/users/:userId/posts/:postId')
async getUserPost(req: HttpRequest, res: HttpResponse): Promise<void> {
  const userId = req.params?.userId;
  const postId = req.params?.postId;
  
  // Fetch and return post
}
```

## Dependency Injection

### Constructor Injection

The framework uses constructor-based dependency injection:

```typescript
@Injectable()
class OrderService {
  constructor(
    private readonly userService: UserService,
    private readonly paymentService: PaymentService
  ) {}
}

// IMPORTANT: Register dependencies manually
registerDependencies(OrderService, [UserService, PaymentService]);
```

### Why Manual Registration?

The new TypeScript decorator API doesn't support `emitDecoratorMetadata`, which means we can't automatically infer constructor parameter types. You must manually register dependencies using `registerDependencies()`.

### Singleton Pattern

All services are singletons by default - only one instance is created and shared across the application.

## Module Organization

### Basic Module Structure

```typescript
@Module({
  controllers: [UserController, PostController],
  providers: [UserService, PostService, DatabaseService],
})
class UserModule {}
```

### Importing Modules

```typescript
@Module({
  controllers: [AdminController],
  providers: [AdminService],
  imports: [UserModule, AuthModule],
})
class AdminModule {}
```

### Exporting Providers

```typescript
@Module({
  providers: [ConfigService],
  exports: [ConfigService], // Available to importing modules
})
class ConfigModule {}
```

## Error Handling

### In Controllers

```typescript
@Get('/users/:id')
async getUser(req: HttpRequest, res: HttpResponse): Promise<void> {
  try {
    const id = parseInt(req.params?.id || '0');
    
    if (isNaN(id)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid ID format' }));
      return;
    }
    
    const user = await this.userService.findById(id);
    
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User not found' }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}
```

## Best Practices

### 1. One Controller Per Resource

```typescript
// ✅ Good - one resource per controller
@Controller('/users')
class UserController { }

@Controller('/posts')
class PostController { }

// ❌ Avoid mixing resources in one controller
@Controller('/api')
class ApiController {
  @Get('/users')  // Bad - mixed resources
  @Get('/posts')
}
```

### 2. Keep Controllers Thin

```typescript
// ✅ Good - delegate to service
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}
  
  @Post()
  async create(req: HttpRequest, res: HttpResponse): Promise<void> {
    const user = await this.userService.create(req.body);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user));
  }
}

// ❌ Avoid business logic in controllers
@Controller('/users')
class UserController {
  @Post()
  async create(req: HttpRequest, res: HttpResponse): Promise<void> {
    // Validation, database access, etc. all in controller
    const isValid = validateEmail(req.body.email);
    const user = await database.insert(...);
    await emailService.send(...);
  }
}
```

### 3. Use @Injectable() on Services

```typescript
// ✅ Good - services need @Injectable()
@Injectable()
class UserService { }

// ✅ Good - controllers are auto-injectable
@Controller('/users')
class UserController { }

// ✅ Good - guards are auto-injectable
@GuardDecorator()
class AuthGuard { }

// ❌ Missing @Injectable() on service will cause DI errors
class UserService { }  // Error!
```

### 4. Register All Constructor Dependencies

```typescript
// ✅ Good - dependencies registered
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}
}
registerDependencies(UserController, [UserService]);

// ❌ Forgot to register - will fail at runtime
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}
}
// Missing: registerDependencies(UserController, [UserService]);
```

### 5. Proper HTTP Status Codes

```typescript
// ✅ Use appropriate status codes
res.writeHead(200, ...);  // OK
res.writeHead(201, ...);  // Created
res.writeHead(400, ...);  // Bad Request
res.writeHead(401, ...);  // Unauthorized
res.writeHead(403, ...);  // Forbidden
res.writeHead(404, ...);  // Not Found
res.writeHead(500, ...);  // Internal Server Error
```

## Common Patterns

### Repository Pattern

```typescript
@Injectable()
class UserRepository {
  private users: User[] = [];
  
  findAll(): User[] {
    return this.users;
  }
  
  findById(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }
  
  save(user: User): void {
    this.users.push(user);
  }
}

@Injectable()
class UserService {
  constructor(private repository: UserRepository) {}
  
  async getUsers(): Promise<User[]> {
    return this.repository.findAll();
  }
}

registerDependencies(UserService, [UserRepository]);
```

### Validation

```typescript
@Injectable()
class ValidationService {
  validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

@Injectable()
class UserService {
  constructor(private validator: ValidationService) {}
  
  create(data: any): User {
    if (!this.validator.validateEmail(data.email)) {
      throw new Error('Invalid email');
    }
    // Create user
  }
}

registerDependencies(UserService, [ValidationService]);
```

## Running the Examples

```bash
# Run the main example
pnpm start

# Run the basic example
tsx examples/basic-example.ts
```

## Next Steps

- Check out `bin.ts` for a complete example with guards
- See `examples/basic-example.ts` for a simple Todo app
- Read the README.md for full API documentation
- Explore the `src/` directory to understand the framework internals

## Troubleshooting

### "Provider for X not found in container"

**Solution**: Make sure to:
1. Add `@Injectable()` to services (controllers/guards are auto-injectable)
2. Register it in a module's `providers` array
3. Call `registerDependencies()` if it has constructor parameters

### Routes not found (404 errors)

**Solution**: 
1. Add `@Controller()` to your controller class
2. Register the controller in a module's `controllers` array
3. Ensure route handler methods have proper type signatures

### Guards not working

**Solution**:
1. Add `@GuardDecorator()` to guard class (automatically injectable)
2. Implement the `canActivate()` method
3. Register guards in module's `providers` array

## Support

For issues and questions, please check the documentation or open an issue on the project repository.