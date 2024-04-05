// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import rdfParser from "rdf-parse";
import { Readable } from "stream";
import { QueryEngine } from "@comunica/query-sparql";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "turtlesense" is now active!');

	// Register completion item provider
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ language: "turtle", scheme: "file" }, // "rdf" for RDF documents
			new RDFCompletionItemProvider(),
			":" // Trigger character(s) for activating IntelliSense
		)
	);
}
// Query for all subjects defined in the RDF data
async function querySubjectsFromIRI(
	iri: string
): Promise<{ label: string; description: string }[]> {
	try {
		const comunicaEngine = new QueryEngine();

		// Construct SPARQL query
		const query = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            SELECT ?s ?label ?description
            WHERE {
                ?s ?p <${iri}>.
                OPTIONAL { ?s rdfs:label ?label. }
                OPTIONAL { ?s rdfs:comment ?description. }
            } LIMIT 100`;

		// Execute SPARQL query
		const bindingsStream = await comunicaEngine.queryBindings(query, {
			sources: [iri],
		});

		// Store results
		const subjects: { label: string; description: string }[] = [];

		// Extract labels and descriptions from query results
		for await (const binding of bindingsStream) {
			const label = binding.has("label") ? binding.get("label")!.value : "";
			const description = binding.has("description")
				? binding.get("description")!.value
				: "";
			subjects.push({ label, description });
		}

		return subjects;
	} catch (error) {
		console.error("Error querying subjects from IRI:", error);
		throw error;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}

class RDFCompletionItemProvider implements vscode.CompletionItemProvider {
	async provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken,
		context: vscode.CompletionContext
		// @ts-ignore
	): vscode.ProviderResult<
		vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>
	> {
		const completionItems: vscode.CompletionItem[] = [];
		// Create a readable stream from the RDF data
		const stream = Readable.from(document.getText());

		// Create a new RDF parser
		const parser = rdfParser.parse(stream, {
			contentType: "text/turtle",
			baseIRI: document.uri.toString(),
		});

		// Collect prefixes and corresponding IRIs
		const prefixes: { [key: string]: string } = {};
		parser.on("prefix", (prefix, iri) => {
			prefixes[prefix] = iri.value;
		});

		// Await for parsing to complete
		await new Promise<void>((resolve, reject) => {
			parser.on("error", reject);
			parser.on("data", resolve);
		});

		var wordRange = document.getWordRangeAtPosition(position);
		const phrase = document.getText(wordRange);
		const words = phrase.split(":");
		const prefix = words[0];
		if (prefixes[prefix] !== undefined) {
			const subjects = await querySubjectsFromIRI(prefixes[prefix]);
			subjects.forEach((subject) => {
				const completionItem = createCompletionItem(
					`${prefix}:${subject.label}`,
					subject.description
				);
				completionItems.push(completionItem);
			});
		}

		return completionItems;
	}
}

function createCompletionItem(
	label: string,
	detail: string
): vscode.CompletionItem {
	const completionItem = new vscode.CompletionItem(label);
	completionItem.detail = detail;
	completionItem.kind = vscode.CompletionItemKind.Variable;
	completionItem.documentation = new vscode.MarkdownString(
		`Inserts "${label}" - ${detail}`
	);
	return completionItem;
}
