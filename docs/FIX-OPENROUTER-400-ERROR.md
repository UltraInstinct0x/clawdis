# Fix: OpenRouter/Anthropic 400 "Provider returned error"

## Issue Summary

When using clawdis with OpenRouter and Anthropic's Claude models (e.g., `anthropic/claude-opus-4.5`), the agent would fail with:

```
400 Provider returned error
```

The full error from Anthropic was:
```
tools.6.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf at the top level
```

## Root Cause

Anthropic's API does **not** support JSON schemas with `oneOf`, `allOf`, or `anyOf` at the top level of tool input schemas. 

Several clawdis tools use TypeBox's `Type.Union()` to define variant schemas (e.g., `BrowserToolSchema`, `CanvasToolSchema`, `NodesToolSchema`, `CronToolSchema`, `GatewayToolSchema`). TypeBox compiles `Type.Union()` into JSON Schema's `anyOf`.

The `normalizeToolParameters()` function in `src/agents/pi-tools.ts` was designed to flatten these union schemas by merging all properties into a single object schema. However, it had a bug:

```typescript
// BEFORE (buggy)
return {
  ...tool,
  parameters: {
    ...schema,  // ❌ This spreads the original schema INCLUDING anyOf!
    type: "object",
    properties: mergedProperties,
    // ...
  }
};
```

The `...schema` spread was including the original `anyOf` array in the output, even though the function was adding flattened `properties`. The resulting schema had BOTH `anyOf` AND `properties`, which Anthropic rejected.

## The Fix

Destructure the schema to explicitly exclude `anyOf`, `oneOf`, and `allOf`:

```typescript
// AFTER (fixed)
const {
  anyOf: _anyOf,
  oneOf: _oneOf,
  allOf: _allOf,
  ...restSchema
} = schema;

return {
  ...tool,
  parameters: {
    ...restSchema,  // ✅ Excludes anyOf/oneOf/allOf
    type: "object",
    properties: mergedProperties,
    // ...
  }
};
```

## Files Changed

- `src/agents/pi-tools.ts` - Fixed `normalizeToolParameters()` function
- `src/agents/pi-tools.test.ts` - Updated tests to verify `anyOf` is removed

## Commit

```
fix(tools): remove anyOf/oneOf/allOf from tool schemas for Anthropic compatibility
```

## Testing

After the fix:
1. ✅ Agent responds via CLI: `clawdis agent --message "Hi"`
2. ✅ Agent uses tools correctly (bash, file operations)
3. ✅ Discord bot responds to messages
4. ✅ Mac app receives responses
5. ✅ All unit tests pass

## Configuration Reference

For OpenRouter with Anthropic models, the `~/.clawdis/clawdis.json` should have:

```json
{
  "models": {
    "providers": {
      "openrouter": {
        "baseUrl": "https://openrouter.ai/api/v1",
        "apiKey": "sk-or-v1-...",
        "api": "openai-completions",
        "headers": {
          "HTTP-Referer": "https://clawdis.app",
          "X-Title": "Clawdis"
        },
        "models": [
          {
            "id": "anthropic/claude-opus-4.5",
            "name": "Claude Opus 4.5",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 200000,
            "maxTokens": 8192,
            "compat": {
              "supportsStore": false,
              "supportsDeveloperRole": false,
              "supportsReasoningEffort": false,
              "maxTokensField": "max_tokens"
            }
          }
        ]
      }
    }
  },
  "agent": {
    "model": "openrouter/anthropic/claude-opus-4.5"
  }
}
```

## Debugging Tips

If you encounter similar issues:

1. **Add logging to pi-ai**: Patch `node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js` to log the full error:
   ```javascript
   catch (error) { 
     console.error("OPENAI ERROR:", error);
     // ... rest of handler
   }
   ```

2. **Check the raw error**: OpenRouter wraps Anthropic's errors. Look for `error.error.metadata.raw` which contains the actual Anthropic error message.

3. **Test direct API calls**: Use curl to test if the issue is with parameters or tool schemas:
   ```bash
   curl https://openrouter.ai/api/v1/chat/completions \
     -H "Authorization: Bearer $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model": "anthropic/claude-opus-4.5", "messages": [{"role": "user", "content": "Hi"}]}'
   ```
