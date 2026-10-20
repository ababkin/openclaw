---
summary: "Route OpenClaw through Liquid Inference, an exchange that auctions each model request"
title: "Liquid Inference"
read_when:
  - You want each model request to go to the cheapest eligible offer for that model
  - You want a hard per-request price cap set before the first token
  - You want one key for open-weight and proprietary models from many providers
---

[Liquid Inference](https://inference.ai.exchange) is an auction exchange for LLM inference with an
OpenAI-compatible endpoint. Providers post standing offers. For each request, the exchange ranks the
eligible offers by estimated charge, fixes a price cap before the first token, and charges for the
tokens actually used. OpenClaw talks to it over the `openai-completions` transport.

| Property    | Value                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| Provider id | `liquid`                                                                  |
| Auth        | Liquid Inference buyer key with the `spend` scope, sent as a bearer token |
| API         | `openai-completions`                                                      |
| Base URL    | `https://router.inference.ai.exchange/v1`                                 |

There are two ways to add the provider:

- **The community plugin.** Liquid Inference maintains
  [`@architect-xyz/openclaw-liquid-inference`](https://github.com/architect-xyz/openclaw-liquid-inference)
  on ClawHub. It adds the provider, an `openclaw onboard` auth choice, the exchange's model list and
  the request headers. It is not bundled with OpenClaw. Its canonical documentation, including
  install, configuration and the OpenClaw versions it supports, is the
  [Liquid Inference OpenClaw guide](https://inference.ai.exchange/docs/connect-openclaw).
- **A custom provider entry.** A `models.providers.liquid` block, with no plugin. This page documents
  that setup in full.

Either way, the request headers, refusals and troubleshooting below apply.

## The plugin

```bash
openclaw plugins install clawhub:@architect-xyz/openclaw-liquid-inference --accept-capabilities
printf '%s\n' "$LIQUID_API_KEY" | openclaw models auth paste-api-key --provider liquid --agent main
openclaw config set agents.defaults.model.primary "liquid/liquid.auto"
```

`--accept-capabilities` accepts what the plugin declares: a model provider. The plugin keeps your
other providers and fallbacks, and it sets the primary model only when none is set. Its settings live
under `plugins.entries.liquid.config`; the cap is `capUsd`. For the rest, see the
[Liquid Inference OpenClaw guide](https://inference.ai.exchange/docs/connect-openclaw).

## Custom provider entry

<Steps>
  <Step title="Create a key">
    Sign in at [inference.ai.exchange](https://inference.ai.exchange), add credit to the workspace and
    create an API key with the `spend` scope. Export it in the shell you use for the next steps:

    ```bash
    export LIQUID_API_KEY="example-liquid-key-not-real"
    ```

  </Step>
  <Step title="Add the provider">
    Add the entry with `openclaw config set models.providers.liquid '<json>' --strict-json --merge`:

    ```json5
    {
      models: {
        providers: {
          liquid: {
            baseUrl: "https://router.inference.ai.exchange/v1",
            api: "openai-completions",
            headers: {
              "X-Title": "OpenClaw",
              "x-liquid-cap-usd": "1.00",
            },
            models: [
              {
                id: "liquid.auto",
                name: "liquid.auto",
                input: ["text"],
                contextWindow: 128000,
                maxTokens: 8192,
              },
            ],
          },
        },
      },
    }
    ```

    The `/v1` suffix is required because OpenClaw hands the URL to the OpenAI client, which appends
    `chat/completions`. Most offers accept an output limit of 8192 tokens and refuse a larger one.

  </Step>
  <Step title="Save the key">
    ```bash
    printf '%s\n' "$LIQUID_API_KEY" | openclaw models auth paste-api-key --provider liquid --agent main
    ```

    The key goes to OpenClaw's credential store under the profile `liquid:manual`, not into
    `openclaw.json`, so a gateway that runs as a service uses it without the environment variable.
    Other agents inherit the key of `main`. If you have more than one agent, `--agent` is required.
    To keep the key in the config instead, set `apiKey: "${LIQUID_API_KEY}"` on the provider.

  </Step>
  <Step title="Select the model">
    ```bash
    openclaw config set agents.defaults.model.primary "liquid/liquid.auto"
    openclaw agent exec --cwd . --model liquid/liquid.auto "Reply with the word ready"
    ```

    A running gateway picks up the new provider without a restart.

  </Step>
</Steps>

### Models

The model `id` is a name on the exchange, sent unchanged:

- `liquid.auto` lets the exchange choose a model for each request.
- An exact model name, such as `kimi-k3` or `glm-5.3`, buys that model from the cheapest eligible
  offer.
- A preset that you save in the console applies your own purchasing rules.

To list the current names (no key needed):

```bash
curl https://router.inference.ai.exchange/v1/models
```

Add one entry to `models` for each name you want to select. The exchange resolves the name on every
request, so the entries stay valid when offers change. Set `contextWindow` to the smallest input
window of the model, because OpenClaw compacts a session before it outgrows it. The plugin lists the
exchange's models and their windows itself.

## Request headers

These headers go with every model request to this provider, including compaction requests.

| Header             | Purpose                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `X-Title`          | Labels the requests as OpenClaw on Liquid Inference receipts. Without it, receipts show the OpenAI SDK. |
| `x-liquid-cap-usd` | The most that one request may cost, in USD. The exchange refuses an offer that cannot fit the cap.      |

A task makes several requests, so the request cap does not limit the total charge of a task. Set a
spend limit on the key to limit total spend. To change the cap on the custom entry:

```bash
openclaw config set models.providers.liquid.headers.x-liquid-cap-usd '"0.25"' --strict-json
```

With the plugin:

```bash
openclaw config set plugins.entries.liquid.config.capUsd 0.25 --strict-json
```

## Refusals and fallback models

A refused request costs nothing. OpenClaw handles the exchange's refusals like any provider's:

| Response | What OpenClaw does                                                                               |
| -------- | ------------------------------------------------------------------------------------------------ |
| `429`    | Retries, up to 9 times.                                                                          |
| `503`    | Retries, up to 8 times.                                                                          |
| `400`    | Shows the error at once.                                                                         |
| `402`    | Disables the key for billing. See [Billing disables](/concepts/model-failover#billing-disables). |

The exchange sends `402` when the balance or a spend limit does not cover the request. Adding credit
does not end the disable window. OpenClaw checks a saved key again on a throttle. With fallback models,
it checks only near the end of the window, and the fallback answers until then.

<Warning>
  If `agents.defaults.model.fallbacks` names a model at another provider, OpenClaw sends a refused
  request there and the turn succeeds on that provider, which bills you instead. To keep every
  request on the exchange, clear the fallbacks or name only `liquid/` models:

```bash
openclaw config set agents.defaults.model.fallbacks '[]' --strict-json
```

</Warning>

## Troubleshooting

| Symptom                                                | Fix                                                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`                                                  | Save a valid key again with `openclaw models auth paste-api-key --provider liquid --agent <id>`, for each agent that uses the key.                                                                            |
| `402`, or `liquid` is disabled after a billing failure | Add credit to the workspace or raise the key's spend limit. OpenClaw uses the key again after a check succeeds or the disable window ends. See [Billing disables](/concepts/model-failover#billing-disables). |
| `404`                                                  | Keep `/v1` at the end of `baseUrl`.                                                                                                                                                                           |
| `no_eligible_offer`                                    | Read `eligibility.excluded` in the error body. It names the rule each offer did not meet.                                                                                                                     |
| A turn succeeded but no receipt shows it               | A fallback model at another provider answered. See [Refusals and fallback models](#refusals-and-fallback-models).                                                                                             |

## Related

<CardGroup cols={2}>
  <Card title="Liquid Inference OpenClaw guide" href="https://inference.ai.exchange/docs/connect-openclaw" icon="book">
    The canonical guide for the plugin: install, configuration, supported OpenClaw versions, keys,
    purchasing rules and receipts.
  </Card>
  <Card title="Model selection" href="/concepts/model-providers" icon="layers">
    Overview of all providers, model refs and failover behavior.
  </Card>
  <Card title="Model failover" href="/concepts/model-failover" icon="shuffle">
    How fallbacks and auth-profile cooldowns work.
  </Card>
  <Card title="Configuration" href="/gateway/configuration" icon="gear">
    Full config reference.
  </Card>
</CardGroup>
