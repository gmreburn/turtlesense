// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import rdfParser from "rdf-parse";
import { Readable } from "stream";
import { QueryEngine } from "@comunica/query-sparql";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Register completion item provider
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			{ language: "turtle", scheme: "file" }, // "rdf" for RDF documents
			new RDFCompletionItemProvider(),
			":" // Trigger character(s) for activating IntelliSense
		)
	);

	console.log('Congratulations, the extension "turtlesense" is now active!');
}

// Query for all subjects defined in the RDF data
async function querySubjectsFromIRI(
	iri: string
): Promise<
	{ label: string; type: string; description: string; definition: string }[]
> {
	try {
		const comunicaEngine = new QueryEngine();

		// Construct SPARQL query
		const query = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
			PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            SELECT ?s ?type ?label ?description ?definition
            WHERE {
                ?s ?p <${iri}>.
				OPTIONAL { ?s rdf:type ?type. }
                OPTIONAL { ?s rdfs:label ?label. }
                OPTIONAL { ?s rdfs:comment ?description. }
                OPTIONAL { ?s skos:definition ?definition. }
            } LIMIT 100`;

		// Execute SPARQL query
		const bindingsStream = await comunicaEngine.queryBindings(query, {
			sources: [iri],
		});

		// Store results
		const subjects: {
			label: string;
			type: string;
			description: string;
			definition: string;
		}[] = [];

		// Extract labels and descriptions from query results
		for await (const binding of bindingsStream) {
			const label = binding.has("label") ? binding.get("label")!.value : "";
			const definition = binding.has("definition")
				? binding.get("definition")!.value
				: "";
			const description = binding.has("description")
				? binding.get("description")!.value
				: "";
			const type = binding.has("type") ? binding.get("type")!.value : "";
			subjects.push({ label, type, description, definition });
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
		await new Promise<void>((resolve) => {
			parser.on("error", resolve);
			parser.on("data", resolve);
		});

		var wordRange = document.getWordRangeAtPosition(position, /(\S*):(\S*)/);
		const phrase = document.getText(wordRange);
		console.debug("turtlesense:: phrase", phrase);
		const words = phrase.split(context.triggerCharacter ?? ":");
		console.debug("turtlesense:: prefix words", words);
		const prefix = words[0];
		console.debug("turtlesense:: prefix requested", prefix);
		console.debug("turtlesense:: prefixes detected", prefixes);
		if (prefixes[prefix] !== undefined) {
			const subjects = await querySubjectsFromIRI(prefixes[prefix]);
			subjects.forEach((subject) => {
				const completionItem = createCompletionItem(
					`${prefix}:${subject.label}`,
					subject.description,
					subject.definition,
					subject.type
				);
				completionItems.push(completionItem);
			});
		}

		return completionItems;
	}
}

function createCompletionItem(
	label: string,
	detail: string,
	documentation: string,
	type: string
): vscode.CompletionItem {
	const completionItem = new vscode.CompletionItem(
		label,
		type === "http://www.w3.org/2000/01/rdf-schema#Class"
			? vscode.CompletionItemKind.Class
			: vscode.CompletionItemKind.Property
	);
	completionItem.detail = detail;
	completionItem.documentation = new vscode.MarkdownString(
		`Inserts "${label}" ${type}- ${documentation || detail}`
	);

	return completionItem;
}
