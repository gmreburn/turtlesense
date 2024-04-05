# current state

This will use intelisense to suggest subjects based on the current prefix. For example, rdf: will suggest subjects from the rdf namespace, as it is defined in the current file.

# next steps

look at context of current line to determine which terms to suggest. Is it a subject, predicate, or object? if object, what is the range? if predicate, what is allowed for that subject?

# how to run

Press F5, that should open a new vscode window.. open the ~/src/example.ttl file in that window. Find a line that says rdf:... and attempt to engage the intellisense. You should see term1, term2, term3 from the namespace. Ignore the TypeScript error on provideCompletionItems method. This is not important/issue with Thenable/Promises. Its just a "contract" issue but I prefer to use the suggested typescript return type which came from https://code.visualstudio.com/api#get-started-articles

# TODO / Features

Create a publisher identity and publish v1 of the extension - https://code.visualstudio.com/api/working-with-extensions/publishing-extension#create-a-publisher

infer more context: which part of the tripple is the user? Is this the Object, Subject or predicate? If a predicate, the scope can be limited to the range of the subject. As for the object, could you somehow query for valid ids? Would this be helpful/make sense in the context of vocabulary definition as well as when defining graphs?

# Ready to publish a new version?

- update the version in package.json
- update CHANGELOG.md
- create/verify marketplace authentication - https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token
- run `vsce publish` in the command line - install if missing via `pnpm install -g @vscode/vsce`
