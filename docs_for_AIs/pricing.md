> ## Documentation Index
> Fetch the complete documentation index at: https://docs.fal.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Pricing

> 
Returns unit pricing for requested endpoint IDs. Most models use
**output-based** pricing (e.g., per image/video with proportional
adjustments for resolution/length). Some models use **GPU-based** pricing
depending on architecture. Values are expressed per model's billing unit
in a given currency.

**Authentication:** Required. Users must provide a valid API key. 
Custom pricing or discounts may be applied based on account status.

**Common Use Cases:**
- Display pricing in user interfaces
- Compare pricing across different models
- Build cost estimation tools
- Check current billing rates

See [fal.ai pricing](https://fal.ai/pricing) for more details.
    



## OpenAPI

````yaml reference/platform-apis/openapi/v1.json get /models/pricing
openapi: 3.1.0
info:
  title: Platform APIs
  version: v1
  description: fal REST API for programmatic access to platform resources.
servers:
  - url: https://api.fal.ai/v1
    description: Production server
security: []
paths:
  /models/pricing:
    get:
      tags:
        - Models
        - Pricing
      summary: Pricing
      description: >-

        Returns unit pricing for requested endpoint IDs. Most models use

        **output-based** pricing (e.g., per image/video with proportional

        adjustments for resolution/length). Some models use **GPU-based**
        pricing

        depending on architecture. Values are expressed per model's billing unit

        in a given currency.


        **Authentication:** Required. Users must provide a valid API key. 

        Custom pricing or discounts may be applied based on account status.


        **Common Use Cases:**

        - Display pricing in user interfaces

        - Compare pricing across different models

        - Build cost estimation tools

        - Check current billing rates


        See [fal.ai pricing](https://fal.ai/pricing) for more details.
            
      operationId: getPricing
      parameters:
        - schema:
            anyOf:
              - type: string
              - type: array
                items:
                  type: string
            description: >-
              Filter by specific endpoint ID(s). Accepts 1-50 endpoint IDs.
              Supports comma-separated values: ?endpoint_id=model1,model2 or
              array syntax: ?endpoint_id=model1&endpoint_id=model2
            example:
              - fal-ai/flux/dev
          required: true
          description: >-
            Filter by specific endpoint ID(s). Accepts 1-50 endpoint IDs.
            Supports comma-separated values: ?endpoint_id=model1,model2 or array
            syntax: ?endpoint_id=model1&endpoint_id=model2
          name: endpoint_id
          style: form
          explode: true
          in: query
      responses:
        '200':
          description: Pricing information retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  next_cursor:
                    type:
                      - string
                      - 'null'
                    description: Cursor for the next page of results, null if no more pages
                  has_more:
                    type: boolean
                    description: >-
                      Boolean indicating if more results are available
                      (convenience field derived from next_cursor)
                  prices:
                    type: array
                    items:
                      type: object
                      properties:
                        endpoint_id:
                          type: string
                          description: >-
                            Endpoint identifier (e.g.,
                            'fal-ai/wan/v2.2-a14b/text-to-video',
                            'fal-ai/minimax/video-01/image-to-video')
                        unit_price:
                          type: number
                          minimum: 0
                          description: >-
                            Base price per billing unit (often per generated
                            output; may be per GPU-second for some models) in
                            the specified currency
                        unit:
                          type: string
                          description: >-
                            Unit of measurement for billing: 'image', 'video',
                            or provider-specific GPU/compute unit when
                            applicable. Most models use output-based pricing.
                        currency:
                          type: string
                          minLength: 3
                          maxLength: 3
                          description: Three-letter currency code (ISO 4217, e.g., 'USD')
                      required:
                        - endpoint_id
                        - unit_price
                        - unit
                        - currency
                      description: >-
                        Pricing information for a specific model endpoint. Most
                        models use output-based pricing (e.g., per image/video
                        with proportional adjustments for resolution/length).
                        Some models use GPU-based pricing depending on
                        architecture.
                    description: Pricing information for requested endpoints
                required:
                  - next_cursor
                  - has_more
                  - prices
                description: >-
                  Response containing pricing information for requested
                  endpoints
              example:
                prices:
                  - endpoint_id: fal-ai/flux/dev
                    unit_price: 0.025
                    unit: image
                    currency: USD
                next_cursor: null
                has_more: false
        '400':
          description: Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - authorization_error
                          - validation_error
                          - not_found
                          - rate_limited
                          - server_error
                          - not_implemented
                        description: The category of error that occurred
                      message:
                        type: string
                        description: Human-readable error message
                      docs_url:
                        type: string
                        format: uri
                        description: Link to relevant documentation
                      request_id:
                        type: string
                        description: Unique request identifier for debugging
                    required:
                      - type
                      - message
                    description: Error details
                required:
                  - error
                description: Standard error response format
              example:
                error:
                  type: validation_error
                  message: Invalid request parameters
        '401':
          description: Authentication required
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - authorization_error
                          - validation_error
                          - not_found
                          - rate_limited
                          - server_error
                          - not_implemented
                        description: The category of error that occurred
                      message:
                        type: string
                        description: Human-readable error message
                      docs_url:
                        type: string
                        format: uri
                        description: Link to relevant documentation
                      request_id:
                        type: string
                        description: Unique request identifier for debugging
                    required:
                      - type
                      - message
                    description: Error details
                required:
                  - error
                description: Standard error response format
              example:
                error:
                  type: authorization_error
                  message: Authentication required
        '404':
          description: Resource not found
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - authorization_error
                          - validation_error
                          - not_found
                          - rate_limited
                          - server_error
                          - not_implemented
                        description: The category of error that occurred
                      message:
                        type: string
                        description: Human-readable error message
                      docs_url:
                        type: string
                        format: uri
                        description: Link to relevant documentation
                      request_id:
                        type: string
                        description: Unique request identifier for debugging
                    required:
                      - type
                      - message
                    description: Error details
                required:
                  - error
                description: Standard error response format
              example:
                error:
                  type: not_found
                  message: Resource not found
        '429':
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: object
                    properties:
                      type:
                        type: string
                        enum:
                          - authorization_error
                          - validation_error
                          - not_found
                          - rate_limited
                          - server_error
                          - not_implemented
                        description: The category of error that occurred
                      message:
                        type: string
                        description: Human-readable error message
                      docs_url:
                        type: string
                        format: uri
                        description: Link to relevant documentation
                      request_id:
                        type: string
                        description: Unique request identifier for debugging
                    required:
                      - type
                      - message
                    description: Error details
                required:
                  - error
                description: Standard error response format
              example:
                error:
                  type: rate_limited
                  message: Rate limit exceeded
      security:
        - apiKey: []
components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: Authorization
      description: >-
        API key must be prefixed with "Key ", e.g. Authorization: Key
        YOUR_API_KEY

````