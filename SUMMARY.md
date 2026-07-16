# DI Framework - Complete Summary

## Overview

A lightweight, TypeScript-first dependency injection framework for Node.js with built-in HTTP server support, using the **new TypeScript 5.0+ decorator context API**.

## Key Features

### ✨ Modern TypeScript 5.0+ Decorators

Uses the new decorator context API (not experimental decorators):
- Full type safety with decorator context
- `context.addInitializer()` for proper timing
- No need for `experimentalDecorators: true`
- Standards-compliant (TC39 Stage 3)

### 🎯 Auto-Injectable Controllers and Guards

**Major improvement**: Controllers and guards are now automatically injectable!

```typescript
// ✅ Clean syntax
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}
}

@GuardDecorator()
class AuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

// ❌ Old way (no longer needed)
@Injectable()
@Controller('/users')
class UserController {}
```

### 💉 Dependency Injection

- Constructor-based injection
- Singleton pattern (one instance per class)
- Manual dependency registration: `registerDependencies(Class, [Dep1, Dep2])`
- Type-safe resolution

### 🚀 HTTP Server (node:http)

- Built-in routing
- Path parameters: `/users/:id`
- Query parameters: `?name=john`
- Automatic JSON body parsing
- Multiple HTTP methods: GET, POST, PUT, DELETE, PATCH
- Type-safe request/response handlers

### 🛡️ Guard System

- Route protection with `@UseGuards()`
- Access to execution context
- Multiple guards per route (all must pass)
- Class-level and method-level guards

## Decorator Reference

### Core Decorators

| Decorator | Purpose | Auto-Injectable | Example |
|-----------|---------|-----------------|---------|
| `@Injectable()` | Mark services as injectable | N/A | `@Injectable()` |
| `@Controller(path)` | Define HTTP controller | ✅ Yes | `@Controller('/users')` |
| `@Module(metadata)` | Organize app structure | No | `@Module({...})` |
| `@GuardDecorator()` | Mark guard class | ✅ Yes | `@GuardDecorator()` |

### Route Decorators

| Decorator | HTTP Method | Type Signature Required |
|-----------|-------------|-------------------------|
| `@Get(path?)` | GET | ✅ Yes |
| `@Post(path?)` | POST | ✅ Yes |
| `@Put(path?)` | PUT | ✅ Yes |
| `@Delete(path?)` | DELETE | ✅ Yes |
| `@Patch(path?)` | PATCH | ✅ Yes |

**Important**: Route handlers MUST have explicit type signatures:
```typescript
@Get('/users')
async getUsers(
  request: HttpRequest,    // ← Required
  response: HttpResponse   // ← Required
): Promise<void> {
  // ...
}
```

### Other Decorators

- `@UseGuards(...guards)` - Apply guards to routes or controllers
- `registerDependencies(Class, [deps])` - Register constructor dependencies

## Complete Example

```typescript
import {
  Injectable,
  Controller,
  Module,
  Get,
  Post,
  ApplicationFactory,
  HttpRequest,
  HttpResponse,
  GuardDecorator,
  UseGuards,
  Guard,
  ExecutionContext,
  registerDependencies,
} from './src';

// 1. Service (needs @Injectable)
@Injectable()
class UserService {
  private users = [];
  
  findAll() {
    return this.users;
  }
  
  create(user: any) {
    this.users.push(user);
    return user;
  }
}

// 2. Guard (auto-injectable)
@GuardDecorator()
class AuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.getRequest();
    return !!request.headers.authorization;
  }
}

// 3. Controller (auto-injectable)
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}

  @Get()
  async getAll(req: HttpRequest, res: HttpResponse): Promise<void> {
    const users = this.userService.findAll();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(users));
  }

  @UseGuards(AuthGuard)
  @Post()
  async create(req: HttpRequest, res: HttpResponse): Promise<void> {
    const user = this.userService.create(req.body);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user));
  }
}

// Register constructor dependencies
registerDependencies(UserController, [UserService]);

// 4. Module
@Module({
  controllers: [UserController],
  providers: [UserService, AuthGuard],
})
class AppModule {}

// 5. Bootstrap
async function main() {
  const app = ApplicationFactory.create(AppModule);
  await app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
  });
}

main();
```

## Project Structure

```
di-framework/
├── src/
│   ├── decorators/
│   │   ├── injectable.decorator.ts    # @Injectable, registerDependencies
│   │   ├── controller.decorator.ts    # @Controller (auto-injectable)
│   │   ├── module.decorator.ts        # @Module, @Global
│   │   ├── route.decorator.ts         # @Get, @Post, etc.
│   │   └── guard.decorator.ts         # @Guard, @UseGuards (auto-injectable)
│   ├── metadata.ts                    # Metadata storage system
│   ├── container.ts                   # DI container
│   ├── server.ts                      # HTTP server
│   ├── application.ts                 # Application factory
│   └── index.ts                       # Public API
├── examples/
│   └── basic-example.ts               # Simple Todo app
├── docs/
│   └── auto-injectable.md             # Auto-injectable documentation
├── bin.ts                             # Full-featured example
├── README.md                          # Main documentation
├── GETTING_STARTED.md                 # Step-by-step guide
├── CHANGELOG.md                       # Version history
└── package.json
```

## Technical Highlights

### 1. New Decorator Context API

```typescript
export function Controller(basePath: string = '') {
  return function <T extends Class>(
    target: T,
    context: ClassDecoratorContext<T>  // ← New context API
  ): T | void {
    // Access to context.name, context.kind, context.metadata
    // Use context.addInitializer() for proper timing
  };
}
```

### 2. Metadata Storage System

```typescript
// Store metadata on classes
MetadataStorage.set(target, METADATA_KEYS.INJECTABLE, true);

// Retrieve metadata
const routes = MetadataStorage.get(Controller, METADATA_KEYS.ROUTES);
```

### 3. Dependency Resolution

```typescript
class Container {
  resolve<T>(token: Class<T>): T {
    // 1. Check if instance exists (singleton)
    // 2. Get dependencies from metadata
    // 3. Resolve dependencies recursively
    // 4. Create instance with resolved dependencies
    // 5. Cache and return
  }
}
```

### 4. Route Registration

```typescript
// Method decorators use addInitializer
context.addInitializer(function (this: any) {
  MetadataStorage.append(this.constructor, METADATA_KEYS.ROUTES, metadata);
});

// Server creates instance first to trigger initializers
const instance = this.container.resolve(ControllerClass);
const routes = MetadataStorage.get(ControllerClass, METADATA_KEYS.ROUTES);
```

## Key Improvements Over v1.0

### Auto-Injectable Feature

**Before:**
```typescript
@Injectable()  // ← Redundant
@Controller('/users')
class UserController {}

@Injectable()  // ← Redundant
@GuardDecorator()
class AuthGuard {}
```

**After:**
```typescript
@Controller('/users')  // ← Auto-injectable!
class UserController {}

@GuardDecorator()  // ← Auto-injectable!
class AuthGuard {}
```

**Benefits:**
- ✅ 50% fewer decorators on controllers/guards
- ✅ Cleaner, more readable code
- ✅ Consistent with other frameworks
- ✅ Less boilerplate
- ✅ More intuitive API

## Running the Examples

```bash
# Install dependencies
pnpm install

# Build the framework
pnpm build

# Run the main example
pnpm start

# Run the basic example
tsx examples/basic-example.ts
```

## Testing the API

```bash
# Health check
curl http://localhost:3000/health

# Get all cats
curl http://localhost:3000/cats

# Create a cat
curl -X POST http://localhost:3000/cats \
  -H "Content-Type: application/json" \
  -d '{"name":"Tom","age":2,"breed":"Tabby"}'

# Protected route (requires auth)
curl http://localhost:3000/cats/protected \
  -H "Authorization: Bearer token"

# Admin route (requires auth + role)
curl http://localhost:3000/cats/admin \
  -H "Authorization: Bearer token" \
  -H "x-role: admin"
```

## Best Practices

1. **Always use `@Injectable()` on services** (not controllers/guards)
2. **Declare proper types** on route handlers
3. **Register constructor dependencies** with `registerDependencies()`
4. **Keep controllers thin** - delegate to services
5. **Use guards for cross-cutting concerns** (auth, logging, etc.)
6. **One controller per resource** (UsersController, PostsController, etc.)
7. **Return proper HTTP status codes** (200, 201, 400, 404, 500, etc.)

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "experimentalDecorators": false,  // ← Use new decorators!
    "useDefineForClassFields": false,
    "strict": true
  }
}
```

## Limitations

- Circular dependencies are not supported
- Only singleton scope is supported
- No request-scoped providers
- Guards run sequentially, not in parallel
- Constructor parameter types require manual registration

## Documentation

- **README.md** - Main documentation with full API reference
- **GETTING_STARTED.md** - Step-by-step tutorial
- **CHANGELOG.md** - Version history and migration guide
- **docs/auto-injectable.md** - Auto-injectable feature details
- **examples/basic-example.ts** - Simple Todo application
- **bin.ts** - Full-featured example with guards

## Architecture

```
┌─────────────────────────────────────────────┐
│           Application Layer                  │
│  (ApplicationFactory, Application)           │
└─────────────────┬───────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
┌────────▼────────┐ ┌─────▼────────┐
│   HTTP Server   │ │  DI Container│
│   (Routing)     │ │  (Injection) │
└────────┬────────┘ └─────┬────────┘
         │                 │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │   Controllers   │
         │    (Routes)     │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │    Services     │
         │   (Business)    │
         └─────────────────┘
```

## What Makes This Framework Special

1. **Modern TypeScript** - Uses the latest decorator API, not experimental
2. **Type-Safe** - Full type safety throughout with proper type declarations
3. **Auto-Injectable** - Controllers and guards are automatically injectable
4. **Minimal** - Lightweight with no external dependencies
5. **Educational** - Clean codebase demonstrating advanced TypeScript patterns
6. **Production-Ready** - Full error handling, guards, and DI support

## Version History

- **v1.1.0** - Auto-injectable controllers and guards
- **v1.0.0** - Initial release with full DI and HTTP server support

## License

MIT

## Support

For issues and questions, check the documentation or open an issue on GitHub.