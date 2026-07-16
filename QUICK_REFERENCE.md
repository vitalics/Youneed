# DI Framework - Quick Reference Card

## Installation & Setup

```bash
pnpm install
pnpm build
pnpm start
```

## Basic Application Structure

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
  registerDependencies,
} from './src';

// 1. Service (needs @Injectable)
@Injectable()
class MyService {
  doSomething() { return 'done'; }
}

// 2. Controller (auto-injectable)
@Controller('/api')
class MyController {
  constructor(private service: MyService) {}
  
  @Get('/hello')
  async hello(req: HttpRequest, res: HttpResponse): Promise<void> {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Hello!' }));
  }
}
registerDependencies(MyController, [MyService]);

// 3. Module
@Module({
  controllers: [MyController],
  providers: [MyService],
})
class AppModule {}

// 4. Bootstrap
async function main() {
  const app = ApplicationFactory.create(AppModule);
  await app.listen(3000);
}
main();
```

## Decorators Cheat Sheet

| Decorator | Purpose | Auto-Injectable | Example |
|-----------|---------|-----------------|---------|
| `@Injectable()` | Mark service | No | `@Injectable()` |
| `@Controller(path)` | Define controller | ✅ Yes | `@Controller('/users')` |
| `@Module(meta)` | Define module | No | `@Module({...})` |
| `@GuardDecorator()` | Mark guard | ✅ Yes | `@GuardDecorator()` |
| `@Get(path?)` | GET route | N/A | `@Get('/users')` |
| `@Post(path?)` | POST route | N/A | `@Post('/users')` |
| `@Put(path?)` | PUT route | N/A | `@Put('/users/:id')` |
| `@Delete(path?)` | DELETE route | N/A | `@Delete('/users/:id')` |
| `@Patch(path?)` | PATCH route | N/A | `@Patch('/users/:id')` |
| `@UseGuards(...g)` | Apply guards | N/A | `@UseGuards(AuthGuard)` |

## Route Handler Signature (REQUIRED)

```typescript
@Get('/path')
async handler(
  request: HttpRequest,    // ← Must be typed!
  response: HttpResponse   // ← Must be typed!
): Promise<void> {
  // implementation
}
```

## Common Patterns

### CRUD Controller

```typescript
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}

  @Get()
  async getAll(req: HttpRequest, res: HttpResponse): Promise<void> {
    const users = this.userService.findAll();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(users));
  }

  @Get('/:id')
  async getOne(req: HttpRequest, res: HttpResponse): Promise<void> {
    const user = this.userService.findById(req.params?.id);
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user));
  }

  @Post()
  async create(req: HttpRequest, res: HttpResponse): Promise<void> {
    const user = this.userService.create(req.body);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user));
  }

  @Put('/:id')
  async update(req: HttpRequest, res: HttpResponse): Promise<void> {
    const user = this.userService.update(req.params?.id, req.body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user));
  }

  @Delete('/:id')
  async delete(req: HttpRequest, res: HttpResponse): Promise<void> {
    this.userService.delete(req.params?.id);
    res.writeHead(204);
    res.end();
  }
}
registerDependencies(UserController, [UserService]);
```

### Guard Implementation

```typescript
@GuardDecorator()
class AuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    const req = context.getRequest();
    return !!req.headers.authorization;
  }
}

// Usage
@UseGuards(AuthGuard)
@Get('/protected')
async protectedRoute(req: HttpRequest, res: HttpResponse): Promise<void> {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Authorized!' }));
}
```

### Multiple Guards (All Must Pass)

```typescript
@UseGuards(AuthGuard, RoleGuard, PermissionGuard)
@Get('/admin')
async adminRoute(req: HttpRequest, res: HttpResponse): Promise<void> {
  // Only accessible if all guards pass
}
```

## Request Data Access

```typescript
@Post('/users')
async create(req: HttpRequest, res: HttpResponse): Promise<void> {
  // Body (auto-parsed JSON)
  const data = req.body;
  
  // Query params (?name=john&age=30)
  const name = req.query?.name;
  const age = req.query?.age;
  
  // Route params (/users/:id)
  const id = req.params?.id;
  
  // Headers
  const auth = req.headers.authorization;
  const contentType = req.headers['content-type'];
}
```

## Response Helpers

```typescript
// JSON response
res.writeHead(200, { 'Content-Type': 'application/json' });
res.end(JSON.stringify(data));

// Error response
res.writeHead(404, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ error: 'Not found' }));

// No content
res.writeHead(204);
res.end();
```

## HTTP Status Codes

| Code | Meaning | Use Case |
|------|---------|----------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing auth |
| 403 | Forbidden | Guard denied access |
| 404 | Not Found | Resource not found |
| 500 | Server Error | Unexpected error |

## Module Configuration

```typescript
@Module({
  controllers: [UserController, PostController],  // HTTP controllers
  providers: [UserService, PostService, AuthGuard], // Injectable services
  imports: [DatabaseModule, AuthModule],           // Other modules
  exports: [UserService],                          // Export for other modules
})
class UserModule {}
```

## Dependency Registration

```typescript
// Single dependency
@Controller('/users')
class UserController {
  constructor(private service: UserService) {}
}
registerDependencies(UserController, [UserService]);

// Multiple dependencies
@Controller('/orders')
class OrderController {
  constructor(
    private orderService: OrderService,
    private userService: UserService,
    private paymentService: PaymentService
  ) {}
}
registerDependencies(OrderController, [
  OrderService,
  UserService,
  PaymentService
]);
```

## Important Rules

✅ **DO:**
- Use `@Injectable()` on services
- Use `@Controller()` on controllers (auto-injectable)
- Use `@GuardDecorator()` on guards (auto-injectable)
- Declare types on route handlers: `(req: HttpRequest, res: HttpResponse): Promise<void>`
- Call `registerDependencies()` for constructor params
- Return proper HTTP status codes

❌ **DON'T:**
- Add `@Injectable()` to controllers (redundant)
- Add `@Injectable()` to guards (redundant)
- Forget to register constructor dependencies
- Omit types on route handler parameters
- Create circular dependencies

## Testing with curl

```bash
# GET request
curl http://localhost:3000/users

# POST with JSON body
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'

# With headers
curl http://localhost:3000/protected \
  -H "Authorization: Bearer token123"

# With query params
curl "http://localhost:3000/search?q=term&limit=10"

# With route params
curl http://localhost:3000/users/123
```

## Common Issues

**"Provider for X not found in container"**
- Add `@Injectable()` to the service
- Register in module's `providers` array
- Call `registerDependencies()` if used in constructor

**Routes not found (404)**
- Add `@Controller()` to the class
- Register in module's `controllers` array
- Check route handler has correct type signature

**Guards not working**
- Add `@GuardDecorator()` to guard class
- Implement `canActivate()` method
- Register in module's `providers` array

## TypeScript Config

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": false,
    "useDefineForClassFields": false,
    "strict": true
  }
}
```

## File Organization

```
src/
├── controllers/
│   ├── user.controller.ts
│   └── post.controller.ts
├── services/
│   ├── user.service.ts
│   └── post.service.ts
├── guards/
│   ├── auth.guard.ts
│   └── role.guard.ts
├── modules/
│   ├── user.module.ts
│   └── app.module.ts
└── main.ts
```

## Resources

- **README.md** - Full documentation
- **GETTING_STARTED.md** - Step-by-step tutorial
- **examples/basic-example.ts** - Simple Todo app
- **bin.ts** - Full-featured example
- **docs/auto-injectable.md** - Auto-injectable details

---

**Version:** 1.1.0 | **License:** MIT