import * as d3 from "d3";

import { Color } from "./diagram";
import { Node } from "./node";
import { GroupPosition } from "./position_cache";
import { classify } from "./util";

export type Constructor = (name: string, color: Color) => void;

export type GroupOptions = {
  color: Color;
  padding: number;
};

export class GroupBase {
  private padding: number;

  // Not appropriately defined in @types/d3/index.d.ts
  private bounds: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  constructor(private name: string, private options: GroupOptions) {
    this.padding = options.padding;
  }

  transform(): string {
    return `translate(${this.bounds.x}, ${this.bounds.y})`;
  }

  groupWidth(): number {
    return this.bounds.width();
  }

  groupHeight(): number {
    return this.bounds.height();
  }

  static divide(nodes: Node[], pattern: RegExp, options: GroupOptions): Group[] {
    const groups = {};
    const register = (name: string, node: Node, parent?: string) => {
      const key = `${parent}:${name}`;
      groups[key] = groups[key] || new Group(name, options);
      groups[key].push(node);
    };

    nodes.forEach((node) => {
      let result = null;

      if (pattern) {
        result = node.name.match(pattern);
        if (result) {
          register(result[1] || result[0], node);
        }
      }

      // Node type based group
      node.group.forEach((name) => register(name, node, String(result)));
    });

    return this.array(groups);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static array(groups: Record<string, any>): Group[] {
    return Object.keys(groups).map((g) => groups[g]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static render(layer: d3.Selection<any>, groups: Group[]): d3.Selection<Group> {
    const group = layer
      .selectAll(".group")
      .data(groups)
      .enter()
      .append("g")
      .attr("class", (d) => `group ${classify(d.name)}`)
      .attr("transform", (d) => d.transform());

    group
      .append("rect")
      .attr("rx", 8)
      .attr("ry", 8)
      .attr("width", (d) => d.groupWidth())
      .attr("height", (d) => d.groupHeight())
      // Fix @types/d3/index.d.ts. Should be "d3.scale.Ordinal<number, string>" but "d3.scale.Ordinal<string, string>" somehow
      .style("fill", (d, i) => d.options.color(i.toString()));

    group.append("text").text((d) => d.name);

    return group;
  }

  static tick(group: d3.Selection<Group>): void {
    group.attr("transform", (d) => d.transform());
    group
      .selectAll("rect")
      .attr("width", (d) => d.groupWidth())
      .attr("height", (d) => d.groupHeight());
  }

  static setPosition(group: d3.Selection<Group>, position: GroupPosition[]): void {
    group.attr("transform", (d, i) => {
      d.bounds.x = position[i].x;
      d.bounds.y = position[i].y;
      return d.transform();
    });
    group
      .selectAll("rect")
      .attr("width", (d, i) => position[i].width)
      .attr("height", (d, i) => position[i].height);
  }
}

const WebColable = (Base: typeof GroupBase) => {
  class Group extends Base {
    private leaves: number[]; // WebCola requires this

    constructor(name: string, options: GroupOptions) {
      super(name, options);

      this.leaves = [];
    }

    push(node: Node): void {
      this.leaves.push(node.id);
    }
  }

  return Group;
};

const Eventable = (Base: typeof GroupBase) => {
  class EventableGroup extends Base {
    private dispatch: d3.Dispatch;

    constructor(name: string, options: GroupOptions) {
      super(name, options);

      this.dispatch = d3.dispatch("rendered");
    }

    static render(layer, groups) {
      const group = super.render(layer, groups);

      group.each(function (this: SVGGElement, d: Group & EventableGroup) {
        d.dispatch.rendered(this);
      });

      return group;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(name: string, callback: (element: SVGGElement) => any): void {
      this.dispatch.on(name, callback);
    }
  }

  return EventableGroup;
};

const Pluggable = (Base: typeof GroupBase) => {
  class Group extends Base {
    private static pluginConstructors: Constructor[] = [];

    constructor(name: string, options: GroupOptions) {
      super(name, options);

      for (const constructor of Group.pluginConstructors) {
        // Call Pluggable at last as constructor may call methods defined in other classes
        constructor.bind(this)(name, options);
      }
    }

    static registerConstructor(func: Constructor): void {
      Group.pluginConstructors.push(func);
    }
  }

  return Group;
};

class WebColableGroup extends WebColable(GroupBase) {}

class EventableGroup extends Eventable(WebColableGroup) {}

// Call Pluggable at last as constructor may call methods defined in other classes
class Group extends Pluggable(EventableGroup) {}

export { Group };
