# Changelog

## [1.1.0] - Auto-Injectable Controllers and Guards

### Added

- **Auto-Injectable Controllers**: `@Controller()` decorator now automatically marks classes as injectable
- **Auto-Injectable Guards**: `@GuardDecorator()` now automatically marks classes as injectable
- No need for redundant `@Injectable()` decorator on controllers and guards

### Changed

#### Before (v1.0.0)

```typescript
// Controllers required both decorators
@Injectable()
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}
}

// Guards required both decorators
@Injectable()
@GuardDecorator()
class AuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}
```

#### After (v1.1.0)

```typescript
// Controllers are automatically injectable
@Controller('/users')
class UserController {
  constructor(private userService: UserService) {}
}

// Guards are automatically injectable
@GuardDecorator()
class AuthGuard implements Guard {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}
```

### Migration Guide

If you're upgrading from v1.0.0, simply remove the `@Injectable()` decorator from:
- All controllers (classes with `@Controller()`)
- All guards (classes with `@GuardDecorator()`)

**Services still require `@Injectable()`** - this change only affects controllers and guards.

### Technical Details

- `@Controller()` decorator now sets `METADATA_KEYS.INJECTABLE` metadata automatically
- `@GuardDecorator()` decorator now sets `METADATA_KEYS.INJECTABLE` metadata automatically
- Controllers and guards are always managed by the DI container, so auto-injection makes sense
- No breaking changes - adding `@Injectable()` still works, it's just redundant

### Benefits

- **Less boilerplate**: One less decorator to remember for controllers and guards
- **More intuitive**: Controllers and guards are inherently part of the DI system
- **Cleaner code**: Reduces visual noise in controller and guard definitions
- **Consistent**: Aligns with other frameworks where controllers are implicitly injectable

## [1.0.0] - Initial Release

### Features

- **Modern TypeScript 5.0+ Decorators**: Uses the new decorator context API
- **Dependency Injection**: Full DI container with automatic resolution
- **HTTP Server**: Built-in node:http server with routing
- **Decorators**:
  - `@Injectable()` - Mark services as injectable
  - `@Controller(path)` - Define HTTP controllers
  - `@Module(metadata)` - Organize application structure
  - `@Get(path)`, `@Post(path)`, etc. - HTTP route handlers
  - `@UseGuards(...guards)` - Route protection
  - `@GuardDecorator()` - Mark guard classes
- **Route Features**:
  - Path parameters (`:id`)
  - Query parameters
  - Automatic JSON body parsing
  - Multiple HTTP methods
- **Guard System**: Flexible route protection with execution context
- **Type Safety**: Full TypeScript support with strict typing