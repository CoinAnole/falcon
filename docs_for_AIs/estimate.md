> ## Documentation Index
> Fetch the complete documentation index at: https://docs.fal.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Estimate cost

> 
Computes cost estimates using one of two methods:

**1. Historical API Price** (`historical_api_price`):
- Based on historical pricing per API call from past usage patterns
- Takes `call_quantity` (number of API calls) per endpoint
- Useful for estimating based on actual historical usage patterns
- Example: "How much will 100 calls to flux/dev cost?"

**2. Unit Price** (`unit_price`):
- Based on unit price × expected billing units from pricing service
- Takes `unit_quantity` (number of billing units like images/videos) per endpoint
- Useful when you know the expected output quantity
- Example: "How much will 50 images from flux/dev cost?"

**Authentication:** Required. Users must provide a valid API key.
Custom pricing or discounts may be applied based on account status.

**Common Use Cases:**
- Pre-calculate costs for batch operations
- Display cost estimates in user interfaces
- Budget planning and cost optimization

See [fal.ai pricing](https://fal.ai/pricing) for more details.
    



## OpenAPI

````yaml reference/platform-apis/openapi/v1.json post /models/pricing/estimate
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
  /models/pricing/estimate:
    post:
      tags:
        - Models
        - Pricing
      summary: Estimate cost
      description: >-

        Computes cost estimates using one of two methods:


        **1. Historical API Price** (`historical_api_price`):

        - Based on historical pricing per API call from past usage patterns

        - Takes `call_quantity` (number of API calls) per endpoint

        - Useful for estimating based on actual historical usage patterns

        - Example: "How much will 100 calls to flux/dev cost?"


        **2. Unit Price** (`unit_price`):

        - Based on unit price × expected billing units from pricing service

        - Takes `unit_quantity` (number of billing units like images/videos) per
        endpoint

        - Useful when you know the expected output quantity

        - Example: "How much will 50 images from flux/dev cost?"


        **Authentication:** Required. Users must provide a valid API key.

        Custom pricing or discounts may be applied based on account status.


        **Common Use Cases:**

        - Pre-calculate costs for batch operations

        - Display cost estimates in user interfaces

        - Budget planning and cost optimization


        See [fal.ai pricing](https://fal.ai/pricing) for more details.
            
      operationId: estimatePricing
      requestBody:
        content:
          application/json:
            schema:
              oneOf:
                - type: object
                  properties:
                    estimate_type:
                      type: string
                      enum:
                        - historical_api_price
                      description: >-
                        Estimate type: historical API pricing based on past
                        usage patterns
                    endpoints:
                      type: object
                      additionalProperties:
                        type: object
                        properties:
                          call_quantity:
                            type: integer
                            minimum: 1
                            description: >-
                              Number of API calls to estimate (regardless of
                              units per call)
                        required:
                          - call_quantity
                      description: Map of endpoint IDs to call quantities
                  required:
                    - estimate_type
                    - endpoints
                  description: >-
                    Historical API price estimate: Calculates cost based on
                    historical pricing per API call. Useful for estimating costs
                    based on actual usage patterns.
                - type: object
                  properties:
                    estimate_type:
                      type: string
                      enum:
                        - unit_price
                      description: >-
                        Estimate type: unit price calculation based on billing
                        units
                    endpoints:
                      type: object
                      additionalProperties:
                        type: object
                        properties:
                          unit_quantity:
                            type: number
                            minimum: 0.000001
                            description: >-
                              Number of billing units expected (e.g., number of
                              images, videos, etc.)
                        required:
                          - unit_quantity
                      description: Map of endpoint IDs to unit quantities
                  required:
                    - estimate_type
                    - endpoints
                  description: >-
                    Unit price estimate: Calculates cost based on unit price ×
                    billing units. Useful for estimating costs when you know the
                    expected output quantity.
              example:
                estimate_type: historical_api_price
                endpoints:
                  fal-ai/flux/dev:
                    call_quantity: 100
                  fal-ai/flux/schnell:
                    call_quantity: 50
            examples:
              historical:
                value:
                  estimate_type: historical_api_price
                  endpoints:
                    fal-ai/flux/dev:
                      call_quantity: 100
                    fal-ai/flux/schnell:
                      call_quantity: 50
                summary: Historical API price estimate
              unit_price:
                value:
                  estimate_type: unit_price
                  endpoints:
                    fal-ai/flux/dev:
                      unit_quantity: 50
                    fal-ai/flux-pro:
                      unit_quantity: 25
                summary: Unit price estimate
      responses:
        '200':
          description: Cost estimates calculated successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  estimate_type:
                    type: string
                    enum:
                      - historical_api_price
                      - unit_price
                    description: The type of estimate that was performed
                  total_cost:
                    type: number
                    minimum: 0
                    description: Total estimated cost across all endpoints
                  currency:
                    type: string
                    minLength: 3
                    maxLength: 3
                    description: Three-letter currency code (ISO 4217, e.g., 'USD')
                required:
                  - estimate_type
                  - total_cost
                  - currency
                description: Cost estimation response with total cost
                example:
                  estimate_type: historical_api_price
                  total_cost: 3.75
                  currency: USD
              examples:
                historical:
                  value:
                    estimate_type: historical_api_price
                    total_cost: 3.75
                    currency: USD
                  summary: Historical API price estimate result
                unit_price:
                  value:
                    estimate_type: unit_price
                    total_cost: 1.88
                    currency: USD
                  summary: Unit price estimate result
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