# Checkout

## Requirements

### Requirement: The system SHALL include tax in every total it shows

#### Scenario: a basket with a taxed item
- **WHEN** a basket holds one item at 1000 with 20% tax
- **THEN** the total shown is 1200

### Requirement: The system SHALL refuse a basket whose total is zero

#### Scenario: an empty basket
- **WHEN** checkout is started with no items
- **THEN** it is refused with a reason
