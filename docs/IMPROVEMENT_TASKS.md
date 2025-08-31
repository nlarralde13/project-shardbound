# Improvement Tasks

The following tasks capture potential refactoring and maintenance opportunities observed during a high-level review of the code base.

- **Add dependency management**
  - Provide a `requirements.txt` (or `pyproject.toml`) so new developers can install Flask, SQLAlchemy, and other dependencies.
  - Update CI to install these dependencies and run the existing test suite.

- **Unify API blueprints**
  - Multiple blueprints share the `/api` prefix (`app/api/routes.py`, `app/api_items.py`, `app/api/actions.py`). Consider consolidating them into a package to avoid route collisions and ease discovery.

- **Extract common helpers**
  - Reusable utilities like pagination helpers (`_pg`, `_meta`) and UUID generation appear in several modules. Move them into a shared `utils` module.

- **Strengthen authentication**
  - The current login flow accepts only an email. Introduce passwords or token-based authentication to secure user accounts.
  - Expand the test suite with login/register tests to ensure the flow works end‑to‑end.

- **Improve input validation**
  - Many endpoints manually check for required fields. A lightweight validation layer or schema library (e.g., marshmallow) would reduce repetition and inconsistencies.

- **Organize configuration**
  - Environment-specific settings are embedded in `create_app`. Extract them into a separate configuration module and use classes or environment variables for clarity.

- **Document and test game actions**
  - `/api/action` dispatches to verbs defined elsewhere. Add unit tests and documentation for supported verbs to make it easier for clients to use this interface.

