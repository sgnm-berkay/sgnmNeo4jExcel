import {
  Injectable,
  Inject,
  OnApplicationShutdown,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import neo4j, {
  Driver,
  Result,
  int,
  Transaction,
  QueryResult,
} from "neo4j-driver";
import { Neo4jConfig } from "./interfaces/neo4j-config.interface";
import { NEO4J_OPTIONS, NEO4J_DRIVER } from "./neo4j.constants";
import TransactionImpl from "neo4j-driver-core/lib/transaction";
import { newError } from "neo4j-driver-core";
import {
  changeObjectKeyName,
  dynamicFilterPropertiesAdder,
  dynamicFilterPropertiesAdderAndAddParameterKey,
  dynamicLabelAdder,
  dynamicNotLabelAdder,
  filterArrayForEmptyString
} from "./func/common.func";
import { successResponse } from "./constant/success.response.object";
import { failedResponse } from "./constant/failed.response.object";
import {
  add_relation_with_relation_name__create_relation_error,
  add_relation_with_relation_name__must_entered_error,
  find_by_id__must_entered_error,
  find_by_realm__not_found_error,
  find_by_realm_with_tree_structure__not_entered_error,
  find_by_realm__not_entered_error,
  find_node_by_id_and_label__must_entered_error,
  find_node_by_id_and_label__not_found_error,
  find_with_children_by_realm_as_tree_error,
  find_with_children_by_realm_as_tree__find_by_realm_error,
  find_with_children_by_realm_as_tree__not_entered_error,
  get_parent_by_id__must_entered_error,
  node_not_found,
  parent_of_child_not_found,
  tree_structure_not_found_by_realm_name_error,
  find_one_node_by_key_must_entered_error,
  find_children_by_id__must_entered_error,
  required_fields_must_entered,
} from "./constant/custom.error.object";
import { RelationDirection } from "./constant/relation.direction.enum";
import { ExportExcelDto, ExportExcelDtoForSystem, ExportExcelDtoForType } from "./dtos/export-import.dtos";
import { HeaderInterface, MainHeaderInterface, UserInformationInterface } from "./interfaces/header.interface";
import { CustomClassificationError } from "./constant/import-export.error.enum";
import { building_already_exist_object, contact_already_exist_object, floor_already_exist_object, space_already_exist_object, space_has_already_relation_object, there_are_no_contacts_object, there_are_no_jointSpaces_object, there_are_no_spaces_object, there_are_no_system_or_component_or_both_object, there_are_no_type_or_component_or_type_id_is_wrong_object, there_are_no_zones_object } from "./constant/import-export.error.object";
const exceljs = require('exceljs');
const { v4: uuidv4 } = require('uuid');
const moment= require('moment');

@Injectable()
export class Neo4jExcelService implements OnApplicationShutdown {
  private readonly driver: Driver;
  private readonly config: Neo4jConfig;
  constructor(
    @Inject(NEO4J_OPTIONS) config: Neo4jConfig,
    @Inject(NEO4J_DRIVER) driver: Driver
  ) {
    this.driver = driver;
    this.config = config;
  }
  getDriver(): Driver {
    return this.driver;
  }
  getConfig(): Neo4jConfig {
    return this.config;
  }
  int(value: number) {
    return int(value);
  }
  beginTransaction(database?: string): Transaction {
    const session = this.getWriteSession(database);

    return session.beginTransaction();
  }
  getReadSession(database?: string) {
    return this.driver.session({
      database: database || this.config.database,
      defaultAccessMode: neo4j.session.READ,
    });
  }
  getWriteSession(database?: string) {
    return this.driver.session({
      database: database || this.config.database,
      defaultAccessMode: neo4j.session.WRITE,
    });
  }
  read(
    cypher: string,
    params?: Record<string, any>,
    databaseOrTransaction?: string | Transaction
  ): Result {
    if (databaseOrTransaction instanceof TransactionImpl) {
      return (<Transaction>databaseOrTransaction).run(cypher, params);
    }
    const session = this.getReadSession(<string>databaseOrTransaction);
    return session.run(cypher, params);
  }
  write(
    cypher: string,
    params?: Record<string, any>,
    databaseOrTransaction?: string | Transaction
  ): Result {
    if (databaseOrTransaction instanceof TransactionImpl) {
      return (<Transaction>databaseOrTransaction).run(cypher, params);
    }

    const session = this.getWriteSession(<string>databaseOrTransaction);
    return session.run(cypher, params);
  }
  async findNodeByIdAndLabel(id: string, label: string) {
    try {
      if (!id || !label) {
        throw new HttpException(
          find_node_by_id_and_label__must_entered_error,
          400
        );
      }
      const idNum = parseInt(id);
      const cypher = `MATCH (c: ${label} {isDeleted: false}) where id(c)=$idNum return c`;
      const result = await this.read(cypher, { idNum });
      if (!result["records"].length) {
        throw new HttpException(
          find_node_by_id_and_label__not_found_error,
          404
        );
      }
      return result["records"];
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw newError(error, "500");
      }
    }
  }
 
  
  
  onApplicationShutdown() {
    return this.driver.close();
  }
  
 
  async findByRealm(
    label: string,
    realm: string,
    databaseOrTransaction?: string | Transaction
  ) {
    try {
      if (!label || !realm) {
        throw new HttpException(find_by_realm__not_entered_error, 400);
      }
      const cypher = `MATCH (n:${label} {isDeleted: false}) where  n.realm = $realm return n`;
      const result = await this.read(cypher, { realm });
      if (!result["records"][0].length) {
        throw new HttpException(find_by_realm__not_found_error, 404);
      }
      return result["records"][0]["_fields"][0];
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw newError(error, "500");
      }
    }
  }
  async findById(id: string, databaseOrTransaction?: string | Transaction) {
    try {
      if (!id) {
        throw new HttpException(find_by_id__must_entered_error, 400);
      }
      const idNum = parseInt(id);

      const cypher =
        "MATCH (n {isDeleted: false}) where id(n) = $idNum return n";

      const result = await this.read(cypher, { idNum });
      if (!result["records"].length) {
        throw new HttpException(node_not_found, 404);
      }
      return result["records"][0]["_fields"][0];
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw newError(error, "500");
      }
    }
  }
 
  

  async findOneNodeByKey(key: string) {
    try {
      if (!key) {
        throw new HttpException(find_one_node_by_key_must_entered_error, 400);
      }
      //find node by key
      let node = await this.read(
        `match(p {key:$key}) where NOT p:Virtual  return p`,
        {
          key,
        }
      );
      if (!node["records"].length) {
        return null;
      }
      node = node["records"][0]["_fields"][0];
      const result = {
        id: node["identity"].low,
        labels: node["labels"],
        properties: node["properties"],
      };
      return result;
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      }
      throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  async findNodesWithRelationNameById(id, relationName) {
    try {
      if (!id || !relationName) {
        throw new HttpException(
          add_relation_with_relation_name__must_entered_error,
          400
        );
      }
      const res = await this.write(
        `MATCH (c {isDeleted: false}) where id(c)= $id MATCH (p {isDeleted: false}) match (c)-[r:${relationName}]-> (p) return count(r)`,
        {
          id,
        }
      );
      return res.records;
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response.message, code: error.response.code },
          error.status
        );
      } else {
        throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
  async getParentById(id: string) {
    try {
      if (!id) {
        throw new HttpException(get_parent_by_id__must_entered_error, 400);
      }
      const res = await this.read(
        "MATCH (c {isDeleted: false}) where id(c)= $id match(k {isDeleted: false}) match (k)-[:PARENT_OF]->(c) return k",
        { id: parseInt(id) }
      );
      if (!res["records"][0].length) {
        throw new HttpException(parent_of_child_not_found, 404);
      }
      return res["records"][0];
    } catch (error) {
      if (error.response.code) {
        throw new HttpException(
          { message: error.response.message, code: error.response.code },
          error.status
        );
      }
      throw newError(failedResponse(error), "400");
    }
  }
  async findChildrenById(id: string) {
    try {
      if (!id) {
        throw new HttpException(find_children_by_id__must_entered_error, 400);
      }
      const idNum = parseInt(id);
      await this.findById(id);
      const cypher =
        "match (n {isDeleted: false})-[:PARENT_OF]->(p {isDeleted: false}) where id(n)=$idNum  return p";
      const result = await this.read(cypher, { idNum });
      return result;
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw newError(error, "500");
      }
    }
  }
 
  
  async addRelationWithRelationName(
    first_node_id: string,
    second_node_id: string,
    relationName: string,
    relationDirection: RelationDirection = RelationDirection.RIGHT
  ) {
    try {
      let res: QueryResult;
      switch (relationDirection) {
        case RelationDirection.RIGHT:
          res = await this.write(
            `MATCH (c {isDeleted: false}) where id(c)= $first_node_id MATCH (p {isDeleted: false}) where id(p)= $second_node_id MERGE (c)-[:${relationName}]-> (p)`,
            {
              first_node_id: parseInt(first_node_id),
              second_node_id: parseInt(second_node_id),
            }
          );
          break;
        case RelationDirection.LEFT:
          res = await this.write(
            `MATCH (c {isDeleted: false}) where id(c)= $first_node_id MATCH (p {isDeleted: false}) where id(p)= $second_node_id MERGE (c)<-[:${relationName}]- (p)`,
            {
              first_node_id: parseInt(first_node_id),
              second_node_id: parseInt(second_node_id),
            }
          );
          break;
        default:
          throw new HttpException("uygun yön giriniz", 400);
      }

      const { relationshipsCreated } =
        await res.summary.updateStatistics.updates();
      if (relationshipsCreated === 0) {
        throw new HttpException(
          add_relation_with_relation_name__create_relation_error,
          400
        );
      }
      return successResponse(res);
    } catch (error) {
      if (error?.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
  async addRelationWithRelationNameByKey(
    first_node_key: string,
    second_node_key: string,
    relationName: string,
    relationDirection: RelationDirection = RelationDirection.RIGHT
  ) {
    try {
      if (
        !first_node_key ||
        !second_node_key ||
        relationName.trim() === "" ||
        !relationName
      ) {
        throw new HttpException(
          add_relation_with_relation_name__must_entered_error,
          400
        );
      }
      const values = Object.values(RelationDirection);
      if (!values.includes(relationDirection)) {
        throw new HttpException("uygun yön giriniz", 400);
      }
      let res: QueryResult;

      switch (relationDirection) {
        case RelationDirection.RIGHT:
          res = await this.write(
            `MATCH (c {isDeleted: false}) where c.key= $first_node_key MATCH (p {isDeleted: false}) where p.key= $second_node_key MERGE (c)-[:${relationName}]-> (p)`,
            {
              first_node_key,
              second_node_key,
            }
          );
          break;
        case RelationDirection.LEFT:
          res = await this.write(
            `MATCH (c {isDeleted: false}) where c.key= $first_node_key MATCH (p {isDeleted: false}) where p.key= $second_node_key MERGE (c)<-[:${relationName}]- (p)`,
            {
              first_node_key,
              second_node_key,
            }
          );
        default:
          throw new HttpException("uygun yön giriniz", 400);
      }
      if (relationDirection === RelationDirection.RIGHT) {
      } else {
      }
      const { relationshipsCreated } =
        await res.summary.updateStatistics.updates();
      if (relationshipsCreated === 0) {
        throw new HttpException(
          add_relation_with_relation_name__create_relation_error,
          400
        );
      }
      return successResponse(res);
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response.message, code: error.response.code },
          error.status
        );
      } else {
        throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }
  //  Control down Control down Control down Control down Control down Control down Control down Control down Control down
  async findNodesByKeyWithRelationName(key: string, relationName: string) {
    const relations = await this.read(
      `match(p {key:$key}) match (c) where c.isDeleted=false match (p)-[:${relationName}]->(c) return c`,
      {
        key,
      }
    );
    if (relations.records.length === 0) {
      //throw new HttpException('hiç ilişkisi yok', 400);
      return null;
    }
    return relations.records;
  }
  async findNodeAndRelationByRelationNameAndId(
    id: string,
    relationName: string,
    direction: string
  ) {
    try {
      if (!id || !relationName) {
        let a = 1;
        //throw new HttpException(find_by_relation__must_entered_error, 400);
      }
      const idNum = parseInt(id);
      await this.findById(id);

      let cypher;
      if (direction == RelationDirection.LEFT) {
        cypher = `match (n {isDeleted: false})<-[r:${relationName}]-(p {isDeleted: false}) where id(n)=$idNum  return p,r`;
      } else if (direction == RelationDirection.RIGHT) {
        cypher = `match (n {isDeleted: false})-[r:${relationName}]->(p {isDeleted: false}) where id(n)=$idNum  return p,r`;
      }
      const result = await this.read(cypher, { idNum });
      return result;
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw newError(error, "500");
      }
    }
  }
  
  async findNodeByKeysAndRelationName(
    key: string,
    referenceKey: string,
    relationName: string,
    relationDirection: RelationDirection = RelationDirection.RIGHT
  ) {
    let relationExist: QueryResult;
    if (relationDirection === RelationDirection.RIGHT) {
      relationExist = await this.read(
        `match(p {isDeleted:false}) where p.key=$key match (c {isDeleted:false}) where c.referenceKey=$referenceKey match (p)-[:${relationName}]->(c) return p,c`,
        {
          key,
          referenceKey: referenceKey,
        }
      );
    } else if (relationDirection === RelationDirection.LEFT) {
      relationExist = await this.read(
        `match(p {isDeleted:false}) where p.key=$key match (c {isDeleted:false}) where c.referenceKey=$referenceKey match (p)<-[:${relationName}]-(c) return p,c`,
        {
          key,
          referenceKey: referenceKey,
        }
      );
    } else {
      throw new HttpException("uygun yön giriniz", 400);
    }
    return relationExist.records;
  }
  async checkSpecificVirtualNodeCountInDb(
    referenceKey: string,
    relationName: string
  ) {
    try {
      const node = await this.read(
        `match(p) match (c {referenceKey:$referenceKey,isDeleted:false}) match (p)-[:${relationName}]->(c) return c`,
        { referenceKey }
      );
      return node.records;
    } catch (error) {
      throw new HttpException(error, 500);
    }
  }


  async findWithChildrenByRealmAsTreeOneLevel(label: string, realm: string) {
    try {
      if (!label || !realm) {
        throw new HttpException(
          find_with_children_by_realm_as_tree__not_entered_error,
          400
        );
      }
      const node = await this.findByRealm(label, realm);
      if (!node) {
        throw new HttpException(
          find_with_children_by_realm_as_tree__find_by_realm_error,
          404
        );
      }
      const cypher = `MATCH p=(n:${label})-[:PARENT_OF]->(m) \
            WHERE  n.realm = $realm and n.isDeleted=false and not n:Virtual and m.isDeleted=false and not m:Virtual and m.canDisplay=true \
            WITH COLLECT(p) AS ps \
            CALL apoc.convert.toTree(ps) yield value \
            RETURN value`;

      const result = await this.read(cypher, { realm });
      if (!result["records"][0].length) {
        throw new HttpException(find_with_children_by_realm_as_tree_error, 404);
      }
      return result["records"][0]["_fields"][0];
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw newError(error, "500");
      }
    }
  }
  async findByRealmWithTreeStructureOneLevel(label: string, realm: string) {
    try {
      if (!label || !realm) {
        throw new HttpException(
          find_by_realm_with_tree_structure__not_entered_error,
          400
        );
      }
      let tree = await this.findWithChildrenByRealmAsTreeOneLevel(label, realm);
      if (!tree) {
        throw new HttpException(
          tree_structure_not_found_by_realm_name_error,
          404
        );
      } else if (Object.keys(tree).length === 0) {
        tree = await this.findByRealm(label, realm);
        const rootNodeObject = { root: tree };
        return rootNodeObject;
      } else {
        const rootNodeObject = { root: tree };
        return rootNodeObject;
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw newError(error, "500");
      }
    }
  }

  async findChildNodesOfFirstParentNodeByLabelsRealmAndName(
    first_node_label: string,
    first_node_realm: string,
    second_child_node_label: string,
    second_child_node_name: string,
    children_nodes_label: string,
    relationName: string,
    relationDirection: RelationDirection = RelationDirection.RIGHT
  ) {
    try {
      if (
        !first_node_label ||
        !first_node_realm ||
        !second_child_node_label ||
        !second_child_node_name ||
        !children_nodes_label
      ) {
        throw new HttpException(
          add_relation_with_relation_name__must_entered_error, //DEĞİŞECEK
          400
        );
      }
      let res: QueryResult;
      switch (relationDirection) {
        case RelationDirection.RIGHT:
          res = await this.read(
            `MATCH (c:${first_node_label} {isDeleted: false}) where c.realm= $first_node_realm \
             MATCH (p:${second_child_node_label} {isDeleted: false}) where p.name= $second_child_node_name \
             MATCH  (c)-[:${relationName}]->(p)-[:${relationName}]->(z:${children_nodes_label} {isDeleted: false, isActive: true}) return z order by z.index asc`,
            {
              first_node_realm: first_node_realm,
              second_child_node_name: second_child_node_name,
            }
          );
          break;
        case RelationDirection.LEFT:
          res = await this.read(
            `MATCH (c:${first_node_label} {isDeleted: false}) where c.realm= $first_node_realm \
             MATCH (p:${second_child_node_label} {isDeleted: false}) where p.name= $second_child_node_name \
             MATCH  (c)<-[:${relationName}]-(p)<-[:${relationName}]-(z:${children_nodes_label} {isDeleted: false, isActive: true}) return z order by z.index asc`,
            {
              first_node_realm: first_node_realm,
              second_child_node_name: second_child_node_name,
            }
          );
          break;
        default:
          throw new HttpException("uygun yön giriniz", 400);
      }
      if (!res) {
        throw new HttpException(
          tree_structure_not_found_by_realm_name_error, //DEĞİŞECEK
          404
        );
      }
      return res;
    } catch (error) {
      if (error?.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

 

 

  

  //---------------------------------------------- Yeni version ---------------------------

  async findByIdAndFilters(
    id: number,
    filter_properties: object = {},
    excluded_labels: Array<string> = [],
    databaseOrTransaction?: string | Transaction
  ) {
    const excludedLabelsLabelsWithoutEmptyString =
      filterArrayForEmptyString(excluded_labels);
    let query =
      "match (n" +
      dynamicFilterPropertiesAdder(filter_properties) +
      ` where id(n)=${id} `;
    if (
      excludedLabelsLabelsWithoutEmptyString &&
      excludedLabelsLabelsWithoutEmptyString.length > 0
    ) {
      query =
        query +
        " and " +
        dynamicNotLabelAdder("n", excludedLabelsLabelsWithoutEmptyString) +
        ` return n`;
    } else {
      query = query + ` return n`;
    }

    filter_properties["id"] = id;
    const node = await this.read(
      query,
      filter_properties,
      databaseOrTransaction
    );

    delete filter_properties["id"];

    if (node.records.length === 0) {
      throw new HttpException(node_not_found, 404);
    } else {
      return node.records[0]["_fields"][0];
    }
  }

 

  async findChildrensByIdAndFilters(
    root_id: number,
    root_filters: object = {},
    children_labels: Array<string> = [],
    children_filters: object = {},
    relation_name: string,
    databaseOrTransaction?: string | Transaction
  ) {
    try {
      if (!relation_name) {
        throw new HttpException(required_fields_must_entered, 404);
      }
      const childrenLabelsWithoutEmptyString =
        filterArrayForEmptyString(children_labels);
      const rootNode = await this.findByIdAndFilters(root_id, root_filters);
      if (!rootNode || rootNode.length == 0) {
        throw new HttpException(
          find_with_children_by_realm_as_tree__find_by_realm_error,
          404
        );
      }
      const rootId = rootNode.identity.low;
      const parameters = { rootId, ...children_filters };
      let cypher;
      let response;

      cypher =
        `MATCH p=(n)-[:${relation_name}*]->(m` +
        dynamicLabelAdder(childrenLabelsWithoutEmptyString) +
        dynamicFilterPropertiesAdder(children_filters) +
        `  WHERE  id(n) = $rootId  RETURN n as parent,m as children`;
      children_filters["rootId"] = rootId;
      response = await this.write(cypher, parameters, databaseOrTransaction);

      return response["records"];
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error, 500);
      }
    }
  }
  
  
  async findChildrensByLabelsAndFilters(
    root_labels: Array<string> = [],
    root_filters: object = {},
    children_labels: Array<string> = [],
    children_filters: object = {},
    databaseOrTransaction?: string | Transaction
  ) {
    try {
      const rootLabelsWithoutEmptyString =
        filterArrayForEmptyString(root_labels);
      const childrenLabelsWithoutEmptyString =
        filterArrayForEmptyString(children_labels);

      const cypher =
        `MATCH p=(n` +
        dynamicLabelAdder(rootLabelsWithoutEmptyString) +
        dynamicFilterPropertiesAdder(root_filters) +
        `-[:PARENT_OF*]->(m` +
        dynamicLabelAdder(childrenLabelsWithoutEmptyString) +
        dynamicFilterPropertiesAdderAndAddParameterKey(children_filters) +
        ` RETURN n as parent,m as children`;

      children_filters = changeObjectKeyName(children_filters);
      const parameters = { ...root_filters, ...children_filters };

      const result = await this.read(cypher, parameters, databaseOrTransaction);
      return result["records"];
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error, 500);
      }
    }
  }

  // async findNodesByIdAndRelationName(
  //   first_node_id: number,
  //   first_node_filters: object = {},
  //   second_node_id: number,
  //   second_node_filters: object = {},
  //   relation_name: string,
  //   databaseOrTransaction?: string | Transaction
  // ) {
  //   try {
  //     if (!relation_name) {
  //       throw new HttpException(required_fields_must_entered, 404);
  //     }

  //     const firstNode = await this.findByIdAndFilters(
  //       first_node_id,
  //       first_node_filters
  //     );
  //     const secondNode = await this.findByIdAndFilters(
  //       second_node_id,
  //       second_node_filters
  //     );
  //     if (
  //       !firstNode ||
  //       Object.keys(firstNode).length === 0 ||
  //       !secondNode ||
  //       Object.keys(secondNode).length === 0
  //     ) {
  //       throw new HttpException(
  //         find_with_children_by_realm_as_tree__find_by_realm_error,
  //         404
  //       );
  //     }
  //     const firstNodeId = firstNode.identity.low;
  //     const secondNodeId = secondNode.identity.low;
  //     const parameters = { firstNodeId, secondNodeId };
  //     let cypher;
  //     let response;

  //     cypher = `MATCH p=(n)-[:${relation_name}*]->(m) WHERE  id(n) = $firstNodeId and  id(m) = $secondNodeId RETURN n as parent,m as children`;

  //     response = await this.write(cypher, parameters, databaseOrTransaction);

  //     return response["records"];
  //   } catch (error) {
  //     if (error.response?.code) {
  //       throw new HttpException(
  //         { message: error.response?.message, code: error.response?.code },
  //         error.status
  //       );
  //     } else {
  //       throw new HttpException(error, 500);
  //     }
  //   }
  // }

  // async findChildrensByChildIdAndFilters(
  //   root_labels: Array<string> = [],
  //   root_filters: object = {},
  //   child_id: number,
  //   child_filters: object = {},
  //   relation_name: string,
  //   databaseOrTransaction?: string | Transaction
  // ) {
  //   try {
  //     if (!relation_name) {
  //       throw new HttpException(required_fields_must_entered, 404);
  //     }

  //     const rootLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(root_labels);
  //     const childNode = await this.findByIdAndFilters(child_id, child_filters);
  //     if (!childNode || childNode.length == 0) {
  //       throw new HttpException(
  //         find_with_children_by_realm_as_tree__find_by_realm_error,
  //         404
  //       );
  //     }
  //     const childId = childNode.identity.low;
  //     const parameters = { ...root_filters, childId };
  //     let cypher;
  //     let response;

  //     cypher =
  //       `MATCH p=(n ` +
  //       dynamicLabelAdder(rootLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdder(root_filters) +
  //       `-[:${relation_name}*]->(m)` +
  //       `  WHERE  id(m) = $childId  RETURN n as parent,m as children`;
  //     response = await this.write(cypher, parameters, databaseOrTransaction);

  //     return response["records"];
  //   } catch (error) {
  //     if (error.response?.code) {
  //       throw new HttpException(
  //         { message: error.response?.message, code: error.response?.code },
  //         error.status
  //       );
  //     } else {
  //       throw new HttpException(error, 500);
  //     }
  //   }
  // }
  // async findAllRelationsByIdOnOneLevel(
  //   root_id: number,
  //   root_filters: object = {},
  //   children_labels: Array<string> = [],
  //   children_filters: object = {},
  //   databaseOrTransaction?: string | Transaction
  // ) {
  //   try {
  //     const childrenLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(children_labels);

  //     const rootNode = await this.findByIdAndFilters(root_id, root_filters);
  //     if (!rootNode || Object.keys(rootNode).length == 0) {
  //       throw new HttpException(
  //         find_with_children_by_realm_as_tree__find_by_realm_error,
  //         404
  //       );
  //     }
  //     const rootId = rootNode.identity.low;
  //     const parameters = { ...root_filters, rootId };
  //     let cypher;
  //     let response;

  //     cypher =
  //       `MATCH p=(n)
  //       -[:r*1]->(m` +
  //       dynamicLabelAdder(childrenLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdder(children_filters) +
  //       `  WHERE  id(m) = $rootId  RETURN n as parent,m as children`;
  //     response = await this.write(cypher, parameters, databaseOrTransaction);

  //     return response["records"];
  //   } catch (error) {
  //     if (error.response?.code) {
  //       throw new HttpException(
  //         { message: error.response?.message, code: error.response?.code },
  //         error.status
  //       );
  //     } else {
  //       throw new HttpException(error, 500);
  //     }
  //   }
  // }

  // async findAllRelationsByLabelsOnOneLevel(
  //   root_labels: Array<string> = [],
  //   root_filters: object = {},
  //   children_labels: Array<string> = [],
  //   children_filters: object = {},
  //   databaseOrTransaction?: string | Transaction
  // ) {
  //   try {
  //     const childrenLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(children_labels);
  //     const rootLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(root_labels);

  //     let cypher;
  //     let response;

  //     cypher =
  //       `MATCH p=(n ` +
  //       dynamicLabelAdder(rootLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdder(root_filters) +
  //       `-[:r*1]->(m` +
  //       dynamicLabelAdder(childrenLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdderAndAddParameterKey(children_filters) +
  //       ` RETURN n as parent,m as children`;

  //     children_filters = changeObjectKeyName(children_filters);
  //     const parameters = { ...root_filters, ...children_filters };
  //     response = await this.write(cypher, parameters, databaseOrTransaction);

  //     return response["records"];
  //   } catch (error) {
  //     if (error.response?.code) {
  //       throw new HttpException(
  //         { message: error.response?.message, code: error.response?.code },
  //         error.status
  //       );
  //     } else {
  //       throw new HttpException(error, 500);
  //     }
  //   }
  // }

  // async findChildrensByIdAndNotLabelsOneLevel(
  //   root_id: number,
  //   root_filters: object = {},
  //   children_labels: Array<string> = [],
  //   excluded_labels: Array<string> = [],
  //   children_filters: object = {},
  //   relation_name: string,
  //   databaseOrTransaction?: string | Transaction
  // ) {
  //   try {
  //     if (!relation_name) {
  //       throw new HttpException(required_fields_must_entered, 404);
  //     }

  //     const excludedLabelsLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(excluded_labels);

  //     const childrenLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(children_labels);
  //     const rootNode = await this.findByIdAndFilters(root_id, root_filters);
  //     if (!rootNode || rootNode.length == 0) {
  //       throw new HttpException(
  //         find_with_children_by_realm_as_tree__find_by_realm_error,
  //         404
  //       );
  //     }
  //     const rootId = rootNode.identity.low;
  //     const parameters = { rootId, ...children_filters };
  //     let cypher;
  //     let response;

  //     cypher =
  //       `MATCH p=(n)-[r:${relation_name}]->(m` +
  //       dynamicLabelAdder(childrenLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdder(children_filters) +
  //       `  WHERE  id(n) = $rootId `;
  //     if (
  //       excludedLabelsLabelsWithoutEmptyString &&
  //       excludedLabelsLabelsWithoutEmptyString.length > 0
  //     ) {
  //       cypher =
  //         cypher +
  //         " and " +
  //         dynamicNotLabelAdder("m", excludedLabelsLabelsWithoutEmptyString) +
  //         ` RETURN n as parent,m as children, r as relation`;
  //     } else {
  //       cypher = cypher + ` RETURN n as parent,m as children, r as relation`;
  //     }

  //     children_filters["rootId"] = rootId;
  //     response = await this.write(cypher, parameters, databaseOrTransaction);

  //     return response["records"];
  //   } catch (error) {
  //     if (error.response?.code) {
  //       throw new HttpException(
  //         { message: error.response?.message, code: error.response?.code },
  //         error.status
  //       );
  //     } else {
  //       throw new HttpException(error, 500);
  //     }
  //   }
  // }
  // async findChildrensByLabelsAndFiltersWithNotLabels(
  //   root_labels: Array<string> = [],
  //   root_filters: object = {},
  //   children_labels: Array<string> = [],
  //   children_filters: object = {},
  //   root_exculuded_labels: Array<string> = [],
  //   databaseOrTransaction?: string | Transaction
  // ) {
  //   try {
  //     const rootLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(root_labels);
  //     const childrenLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(children_labels);
  //     const excludedLabelsLabelsWithoutEmptyString = filterArrayForEmptyString(
  //       root_exculuded_labels
  //     );

  //     let cypher =
  //       `MATCH p=(n` +
  //       dynamicLabelAdder(rootLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdder(root_filters) +
  //       `-[:PARENT_OF*]->(m` +
  //       dynamicLabelAdder(childrenLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdderAndAddParameterKey(children_filters);

  //     if (
  //       excludedLabelsLabelsWithoutEmptyString &&
  //       excludedLabelsLabelsWithoutEmptyString.length > 0
  //     ) {
  //       cypher =
  //         cypher +
  //         " where " +
  //         dynamicNotLabelAdder("n", excludedLabelsLabelsWithoutEmptyString) +
  //         ` RETURN n as parent,m as children`;
  //     } else {
  //       cypher = cypher + ` RETURN n as parent,m as children`;
  //     }
  //     ` RETURN n as parent,m as children`;

  //     children_filters = changeObjectKeyName(children_filters);
  //     const parameters = { ...root_filters, ...children_filters };

  //     const result = await this.read(cypher, parameters, databaseOrTransaction);
  //     return result["records"];
  //   } catch (error) {
  //     if (error.response?.code) {
  //       throw new HttpException(
  //         { message: error.response?.message, code: error.response?.code },
  //         error.status
  //       );
  //     } else {
  //       throw new HttpException(error, 500);
  //     }
  //   }
  // }
  

  // async findChildrensByLabelsAndFiltersWithNotLabelsOneLevel(
  //   root_labels: Array<string> = [],
  //   root_filters: object = {},
  //   root_exculuded_labels: Array<string> = [],
  //   children_labels: Array<string> = [],
  //   children_filters: object = {},
  //   children_exculuded_labels: Array<string> = [],
  //   databaseOrTransaction?: string | Transaction
  // ) {
  //   try {
  //     const rootLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(root_labels);
  //     const childrenLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(children_labels);
  //     const parentExcludedLabelsLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(root_exculuded_labels);
  //     const childrenExcludedLabelsLabelsWithoutEmptyString =
  //       filterArrayForEmptyString(children_exculuded_labels);

  //     let cypher =
  //       `MATCH p=(n` +
  //       dynamicLabelAdder(rootLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdder(root_filters) +
  //       `-[:PARENT_OF]->(m` +
  //       dynamicLabelAdder(childrenLabelsWithoutEmptyString) +
  //       dynamicFilterPropertiesAdderAndAddParameterKey(children_filters);

  //     if (
  //       (parentExcludedLabelsLabelsWithoutEmptyString &&
  //         parentExcludedLabelsLabelsWithoutEmptyString.length > 0) ||
  //       (childrenExcludedLabelsLabelsWithoutEmptyString &&
  //         childrenExcludedLabelsLabelsWithoutEmptyString.length > 0)
  //     ) {
  //       cypher =
  //         cypher +
  //         " where " +
  //         dynamicNotLabelAdder(
  //           "n",
  //           parentExcludedLabelsLabelsWithoutEmptyString
  //         ) +
  //         dynamicNotLabelAdder(
  //           "m",
  //           childrenExcludedLabelsLabelsWithoutEmptyString
  //         ) +
  //         ` RETURN n as parent,m as children`;
  //     } else {
  //       cypher = cypher + ` RETURN n as parent,m as children`;
  //     }
  //     ` RETURN n as parent,m as children`;

  //     children_filters = changeObjectKeyName(children_filters);
  //     const parameters = { ...root_filters, ...children_filters };

  //     const result = await this.read(cypher, parameters, databaseOrTransaction);
  //     return result["records"];
  //   } catch (error) {
  //     if (error.response?.code) {
  //       throw new HttpException(
  //         { message: error.response?.message, code: error.response?.code },
  //         error.status
  //       );
  //     } else {
  //       throw new HttpException(error, 500);
  //     }
  //   }
  // }


 
 

//// EXCEL IMPORT-EXPORT ////

///// ASSET

async getTypesExcel(res,body:ExportExcelDtoForType,header:UserInformationInterface){
  try {
    let data=[];
    const {typeKeys}= body;
    const {username,language,realm}=header;
    for(let key of typeKeys){
      let abc =await this.getTypesByRealmAndByLanguage(realm,key,language,username);
    
    if(abc instanceof Error ){
      //throw new HttpException(there_are_no_spaces_object(),404);
    }else {
      data = [...data,...abc]
    }}
  
    let workbook = new exceljs.Workbook();
    let worksheet = workbook.addWorksheet("Types");
  
     worksheet.columns = [
      { header: "Type Name", key: "typeName", width: 50 },
      { header: "Model Name", key: "modelName", width: 50 },
      { header: "Description", key: "description", width: 50 },
      { header: "Warranty Duration Parts", key: "warrantyDurationParts", width: 50 },
      { header: "Warranty Duration Labor", key: "warrantyDurationLabor", width: 50 },
      { header: "Omni Category", key: "omniCategory", width: 50 },
      { header: "Asset Type", key: "assetType", width: 50 },
      { header: "Type Category", key: "typeCategory", width: 50 },
      { header: "Brand", key: "brand", width: 50 },
      { header: "Duration Unit", key: "durationUnit", width: 50 },
      { header: "Created At", key: "createdAt", width: 50 },
    //   { header: "ExpectedLife", key: "expectedLife", width: 25 },
  
     ];
  
  
  worksheet.addRows(data);
  
  
  return workbook.xlsx.write(res).then(function () {
  res.status(200).end();
  });
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      //default_error()
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
  }
  
}

async getTypesByRealmAndByLanguage(realm:string,typeKey:string,language:string,userName:string){
  try {
    let data:any
    let jsonData=[]
    let cypher =`WITH 'MATCH (c:Asset {realm:"${realm}"})-[:PARENT_OF]->(b:Types) MATCH path = (b)-[:PARENT_OF]->(m:Type {key:"${typeKey}"})-[:CLASSIFIED_BY|:ASSET_TYPE_BY|:DURATION_UNIT_BY|:TYPE_CLASSIFIED_BY|:BRAND_BY]->(z) where  z.language="${language}" and m.isDeleted=false  and not (m:Component) 
    WITH collect(path) AS paths
    CALL apoc.convert.toTree(paths)
    YIELD value
    RETURN value' AS query
    CALL apoc.export.json.query(query,'/${userName}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`
    
    await this.write(cypher);
    
    //call the file using below code
    let cypher2=`CALL apoc.load.json("${userName}.json")`;
    
    let returnData =await this.read(cypher2)
    data=await returnData.records[0]["_fields"][0];
  
  
  
        for (let index = 0; index < data.value.parent_of?.length; index++) {
      
          
              let typeProperties = data.value.parent_of[index];
             
              jsonData.push({
                typeName:typeProperties.name,
                modelName:typeProperties.modelNumber,
                description: typeProperties.description,
                warrantyDurationParts: typeProperties.warrantyDurationParts,
                warrantyDurationLabor: typeProperties.warrantyDurationLabor,
                omniCategory:typeProperties.classified_by[0].name,
                assetType:typeProperties.asset_type_by[0].name,
                typeCategory:typeProperties.type_classified_by[0].name,
                brand:typeProperties.brand_by[0].name,
                durationUnit:typeProperties.duration_unit_by[0].name,
                createdAt:typeProperties.createdAt,
                })
  
        }
  
       return jsonData;
  
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      //default_error()
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
  }
     
  
}

async getComponentsExcel(res,body:ExportExcelDtoForType,header:UserInformationInterface){
  let data=[]
  const {typeKeys}= body;
  const {username,realm}=header;
  try {

    for(let key of typeKeys){
      let abc =await this.getComponentsOfTypeWithTypekey(realm,key,username);
    
    if(abc instanceof Error ){
      //throw new HttpException(there_are_no_spaces_object(),404);
    }else {
      data = [...data,...abc]
    }}
    
    let workbook = new exceljs.Workbook();
    let worksheet = workbook.addWorksheet("Components");


    worksheet.columns = [
      { header: "Type Name", key: "typeName", width: 50 },
      { header: "Component Name", key: "componentName", width: 50 },
      { header: "Space Name", key: "spaceName", width: 50 },
      { header: "Description", key: "description", width: 50 },
      { header: "Street", key: "street", width: 50 },
      { header: "Serial No", key: "serialNo", width: 50 },
      { header: "Warranty Duration Labor", key: "warrantyDurationLabor", width: 50 },
      { header: "Warranty Duration Parts", key: "warrantyDurationParts", width: 50 },
     

     ];


    worksheet.addRows(data);


return workbook.xlsx.write(res).then(function () {
    res.status(200).end();
  });
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      //default_error()
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
  }
}

async getComponentsOfTypeWithTypekey(realm: string,typeKey:string,username:string){
    try {
      let data:any
      let jsonData=[]
      let cypher =`WITH 'MATCH (a:Asset {realm:"${realm}"})-[:PARENT_OF]->(b:Types) MATCH path = (b)-[:PARENT_OF]->(t:Type {key:"${typeKey}"})-[:PARENT_OF]->(c:Component) where  t.isDeleted=false and c.isDeleted=false
      WITH collect(path) AS paths
      CALL apoc.convert.toTree(paths)
      YIELD value
      RETURN value' AS query
      CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
      YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
      RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`
      
      await this.write(cypher);
      
      //call the file using below code
      let cypher2=`CALL apoc.load.json("${username}.json")`;
      
      let returnData =await this.read(cypher2)
      data=await returnData.records[0]["_fields"][0];
    
      if (data.length==0) {
        throw new HttpException(there_are_no_type_or_component_or_type_id_is_wrong_object,404)
      } else {
        for (let j = 0; j < data.value.parent_of?.length; j++) { // type
          for (let i = 0; i < data.value.parent_of[j].parent_of?.length; i++) { // components
        
            let componentProperties = data.value.parent_of[j].parent_of[i];
                  
            jsonData.push({
              typeName:data.value.parent_of[j].name,
              componentName:componentProperties.name,
              spaceName: componentProperties.spaceName,
              description:componentProperties.description,
              serialNo:componentProperties.serialNo,
              warrantyDurationLabor:componentProperties.warrantyDurationLabor.low,
              warrantyDurationParts:componentProperties.warrantyDurationParts.low
              })
          }
        }
      
       return jsonData;
      
      
      }
      
    
    } catch (error) {
      if(error.response?.code){
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      }else {
        //default_error()
        throw new HttpException(
          {code: CustomClassificationError.DEFAULT_ERROR },
          error.status
        );
      }
    }
    
}

async getSystemsExcel(res,body:ExportExcelDtoForSystem,header:UserInformationInterface){
  let data=[];
  const {systemKeys}= body;
  const {username,realm}=header;
try {
  for(let key of systemKeys){
    let abc =await this.getSystemsByKey(realm,key,username);
  
  if(abc instanceof Error ){
    throw new HttpException(there_are_no_spaces_object,404);
  }else {
    data = [...data,...abc]
  }}

  let workbook = new exceljs.Workbook();
  let worksheet = workbook.addWorksheet("Systems");


  worksheet.columns = [
    { header: "System Name", key: "systemName", width: 50 },
    { header: "System Description", key: "systemDescription", width: 50},
    { header: "Component Name", key: "componentName", width: 50 },
    { header: "Space Name", key: "spaceName", width: 50 },
    { header: "Description", key: "description", width: 50 },
    { header: "Serial No", key: "serialNo", width: 50 },
    { header: "Warranty Duration Labor", key: "warrantyDurationLabor", width: 50 },
    { header: "Warranty Duration Parts", key: "warrantyDurationParts", width: 50 },
   ];


worksheet.addRows(data);
return workbook.xlsx.write(res).then(function () {
res.status(200).end();
});
} catch (error) {
  if(error.response?.code){
    throw new HttpException(
      { message: error.response?.message, code: error.response?.code },
      error.status
    );
  }else {
    //default_error()
    throw new HttpException(
      {code: CustomClassificationError.DEFAULT_ERROR },
      error.status
    );
  }
}
 
}

async getSystemsByKey(realm: string, systemKey:string,username:string){
  try {
    let data:any
    let jsonData=[]
    let cypher =`WITH 'MATCH (a:Asset {realm:"${realm}"})-[:PARENT_OF]->(b:Systems) MATCH path = (b)-[:PARENT_OF]->(s:System {key:"${systemKey}"})-[:SYSTEM_OF]->(c:Component) where  s.isDeleted=false and c.isDeleted=false
    WITH collect(path) AS paths
    CALL apoc.convert.toTree(paths)
    YIELD value
    RETURN value' AS query
    CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`
    
    await this.write(cypher);
    
    //call the file using below code
    let cypher2=`CALL apoc.load.json("${username}.json")`;
    
    let returnData =await this.read(cypher2)
    data=await returnData.records[0]["_fields"][0];
  
if (data.length==0) {
  throw new HttpException(there_are_no_system_or_component_or_both_object,404);
} else {
  for (let j = 0; j < data.value.parent_of?.length; j++) { // system
    for (let c = 0; c < data.value.parent_of[j].system_of?.length; c++) { // components
     
      let componentProperties = data.value.parent_of[j].system_of[c];
            
      jsonData.push({
        systemName:data.value.parent_of[j].name,
        systemDescription:data.value.parent_of[j].description,
        componentName:componentProperties.name,
        spaceName: componentProperties.spaceName,
        description:componentProperties.description,
        serialNo:componentProperties.serialNumber,
        warrantyDurationLabor:componentProperties.warrantyDurationLabor.low,
        warrantyDurationParts:componentProperties.warrantyDurationParts.low,
        })
    }
  }

return jsonData;
}

    
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      //default_error()
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
  }
}


///// FACILITY

async getSpacesByBuilding(realm:string,username:string,buildingKey:string,language:string){
  try {
    let data:any
    let jsonData=[]
    let buildingType=[]
    let cypher =`WITH 'MATCH (c:FacilityStructure {realm:"${realm}"})-[:PARENT_OF]->(b {key:"${buildingKey}",isDeleted:false}) MATCH path = (b)-[:PARENT_OF*]->(m)-[:CLASSIFIED_BY|:CREATED_BY]->(z) where  (z.language="${language}" or not exists(z.language)) and m.isDeleted=false  and not (m:JointSpaces OR m:JointSpace OR m:Zones or m:Zone) 
    WITH collect(path) AS paths
    CALL apoc.convert.toTree(paths)
    YIELD value
    RETURN value' AS query
    CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`
    
    await this.write(cypher);
    
    //call the file using below code
    let cypher2=`CALL apoc.load.json("${username}.json")`
    
    let returnData =await this.read(cypher2)
    data=await returnData.records[0]["_fields"][0];
    
    console.log(data.value.parent_of[0]?.nodeType)   
    console.log(typeof data.value.parent_of[0].parent_of)                                                                                           
    if(data.value.parent_of==undefined || (data.value.parent_of[0]?.nodeType=="Floor" && typeof data.value.parent_of[0].parent_of=="undefined") ||(data.value.parent_of[0]?.nodeType=="Block" && (typeof data.value.parent_of[0].parent_of=="undefined" ||typeof data.value.parent_of[0].parent_of[0].parent_of=="undefined"))){
      throw new HttpException(there_are_no_spaces_object,404);
      
    }
    else {
      if(data.value.parent_of[0]?.parent_of[0]?.parent_of==undefined){
        for (let index = 0; index < data.value.parent_of?.length; index++) {
      
          for (let i = 0; i < data.value.parent_of[index].parent_of?.length; i++) {
           buildingType.push({i:data.value.nodeType,
             2:data.value.parent_of[index].nodeType,
             3:data.value.parent_of[index].parent_of[i].nodeType})
           
          }}
      }else{
        for (let index = 0; index < data.value.parent_of?.length; index++) {
          for (let i = 0; i < data.value.parent_of[index].parent_of?.length; i++) {
         
           for (let a = 0; a < data.value.parent_of[index].parent_of[i].parent_of?.length; a++) {
           
             buildingType.push({1:data.value.nodeType,
               2:data.value.parent_of[index].nodeType,
               3:data.value.parent_of[index].parent_of[i].nodeType,
                 4:data.value.parent_of[index].parent_of[i].parent_of[a].nodeType})
             
           }
           
         }}
      }
      
      let typeList=await Object.values(buildingType[0]);
      console.log(typeList);
      
       if(!typeList.includes("Block")){
        for (let index = 0; index < data.value.parent_of?.length; index++) {
      
          for (let i = 0; i < data.value.parent_of[index].parent_of?.length; i++) {
            let spaceProperties = data.value.parent_of[index].parent_of[i];
              jsonData.push({buildingName:data.value.name,
                blockName:"-",
                floorName:data.value.parent_of[index].name,
                spaceName:spaceProperties.name,
                code:spaceProperties.code ? spaceProperties.code : " ",
                architecturalName:spaceProperties.architecturalName,
                architecturalCode:spaceProperties.architecturalCode  ? spaceProperties.architecturalCode : " ",
                category:spaceProperties.classified_by[0].name,
                grossArea:spaceProperties.grossArea,
                netArea:spaceProperties.netArea,
                usage:spaceProperties.usage ? spaceProperties.usage : " ",
                tag:spaceProperties.tag.toString(),
                roomTag:spaceProperties.roomTag.toString(),
                status:spaceProperties.status? spaceProperties.status: " ",
                operatorName:spaceProperties.operatorName ? spaceProperties.operatorName : " ", 
                operatorCode:spaceProperties.operatorCode ? spaceProperties.operatorCode : " ", 
                description:spaceProperties.description,
                usableHeight:spaceProperties.usableHeight,
                externalSystem:spaceProperties.externalSystem,
                externalObject:spaceProperties.externalObject,
                externalIdentifier:spaceProperties.externalIdentifier,
                createdOn:spaceProperties.createdOn,
                createdBy:spaceProperties.created_by[0].email
                })
          }
        }
      
      
       } else {
        for (let index = 0; index < data.value.parent_of?.length; index++) {
      
          for (let i = 0; i < data.value.parent_of[index]?.parent_of?.length; i++) {
            
            for (let a = 0; a < data.value.parent_of[index]?.parent_of[i]?.parent_of?.length; a++) {
              let spaceProperties = data.value.parent_of[index]?.parent_of[i]?.parent_of[a];
              
              jsonData.push({buildingName:data.value.name,
                blockName:data.value.parent_of[index].name,
                floorName:data.value.parent_of[index].parent_of[i].name,
                spaceName:data.value.parent_of[index].parent_of[i].parent_of[a].name,
                code:spaceProperties.code ? spaceProperties.code: " ",
                architecturalName:spaceProperties.architecturalName,
                architecturalCode:spaceProperties.architecturalCode  ? spaceProperties.architecturalCode: " ",
                category:spaceProperties.classified_by[0].name,
                grossArea:spaceProperties.grossArea,
                netArea:spaceProperties.netArea,
                usage:spaceProperties.usage ? spaceProperties.usage : " ",
                tag:spaceProperties.tag.toString(),
                roomTag:spaceProperties.roomTag.toString(),
                status:spaceProperties.status? spaceProperties.status: " ",
                operatorName:spaceProperties.operatorName ? spaceProperties.operatorName : " ", 
                operatorCode:spaceProperties.operatorCode ? spaceProperties.operatorCode : " ", 
                description:spaceProperties.description,
                usableHeight:spaceProperties.usableHeight,
                externalSystem:spaceProperties.externalSystem,
                externalObject:spaceProperties.externalObject,
                externalIdentifier:spaceProperties.externalIdentifier,
                createdOn:spaceProperties.createdOn,
                createdBy:spaceProperties.created_by[0].email
                })
              
            }
            
          }
        }
      }
      return jsonData;
    }
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }

   }

  
}
  
async getJointSpacesByBuilding(realm:string,username:string,buildingKey:string,language:string ){
  try {
    let data:any
    let jsonData=[]
    let cypher =`WITH 'MATCH (c:FacilityStructure {realm:"${realm}"})-[:PARENT_OF]->(b {key:"${buildingKey}",isDeleted:false}) MATCH path = (b)-[:PARENT_OF*]->(m)-[:CLASSIFIED_BY|:CREATED_BY]->(z) where  (z.language="${language}" or not exists(z.language)) and m.isDeleted=false  and not (m:Space OR m:Zone OR m:Zones OR m:Floor OR m:Block)
    WITH collect(path) AS paths
    CALL apoc.convert.toTree(paths)
    YIELD value
    RETURN value' AS query
    CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`
    
    await this.write(cypher);
    
    //call the file using below code
    let cypher2=`CALL apoc.load.json("${username}.json")`;
    let returnData =await this.read(cypher2)
    data=await returnData.records[0]["_fields"][0]
    
    if(Object.keys(data?.value).length==0 ){
      throw new HttpException(there_are_no_jointSpaces_object,404)
    }
   
    for (let index = 0; index < data.value.parent_of?.length; index++) {
      
      for (let i = 0; i < data.value.parent_of[index].parent_of?.length; i++) {
        let jointSpaceProperties=data.value.parent_of[index].parent_of[i];

        jsonData.push({buildingName:data.value.name,
          jointSpaceName:jointSpaceProperties.name,
          category:jointSpaceProperties.classified_by[0].name,
          createdBy:jointSpaceProperties.created_by[0].name,
          spaceNames:jointSpaceProperties.jointSpaceTitle,
          description:jointSpaceProperties.description,
          tags:jointSpaceProperties.tag.toString(),
          roomTags:jointSpaceProperties.roomTag.toString(),
          status:jointSpaceProperties.status ? jointSpaceProperties.status : " ",
          usage :jointSpaceProperties.usage ? jointSpaceProperties.usage : " ",
          usableHeight:jointSpaceProperties.usableHeight ? jointSpaceProperties.usableHeight : " ",
          grossArea:jointSpaceProperties.grossArea ? jointSpaceProperties.grossArea : " ",
          netArea:jointSpaceProperties.netArea ? jointSpaceProperties.netArea : " ",

        })
      }
    }
  


  return jsonData;
  
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      //default_error()
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
   }
   
    
}

async getZonesByBuilding(realm:string,username:string,buildingKey:string,language:string ){
      try {
        let data:any
        let jsonData=[]
        let cypher =`WITH 'MATCH (c:FacilityStructure {realm:"${realm}"})-[:PARENT_OF]->(b {key:"${buildingKey}",isDeleted:false}) MATCH path = (b)-[:PARENT_OF*]->(m)-[:CREATED_BY|:CLASSIFIED_BY]->(z) where (z.language="${language}" or not exists(z.language)) and m.isDeleted=false  and not (m:Space OR m:JointSpaces OR m:JointSpace OR m:Floor OR m:Block)
        WITH collect(path) AS paths
        CALL apoc.convert.toTree(paths)
        YIELD value
        RETURN value' AS query
        CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
        YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
        RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`
        
        await this.write(cypher);
        
        //call the file using below code
        let cypher2=`CALL apoc.load.json("${username}.json")`
        
        let returnData =await this.read(cypher2)
        data=await returnData.records[0]["_fields"][0]
  
        if(Object.keys(data?.value).length==0 ){
          throw new HttpException(there_are_no_zones_object,404)
        }else {
          console.log(data.value.parent_of[0].parent_of[0].nodeType);
          console.log(data.value.parent_of[0].parent_of.length)
             
              for (let index = 0; index < data.value.parent_of?.length; index++) {
            
                for (let i = 0; i < data.value.parent_of[index].parent_of?.length; i++) {
                  
                  jsonData.push({buildingName:data.value.name,
                    zoneName:data.value.parent_of[index].parent_of[i].name,
                    category:data.value.parent_of[index].parent_of[i].classified_by[0].name,
                    createdBy:data.value.parent_of[index].parent_of[i].created_by[0].email,
                    spaceNames:data.value.parent_of[index].parent_of[i].spaceNames.toString(),
                    description:data.value.parent_of[index].parent_of[i].description,
                    tags:data.value.parent_of[index].parent_of[i].tag.toString()
                  
                  })
                   
                }
              }
            
      
             return jsonData;
        }
  
      } catch (error) {
        if(error.response?.code){
          throw new HttpException(
            { message: error.response?.message, code: error.response?.code },
            error.status
          );
        }else {
          throw new HttpException(
            {code: CustomClassificationError.DEFAULT_ERROR },
            error.status
          );
        }
    
       }
         
          
}

async getSpacesAnExcelFile(res, body:ExportExcelDto,header:UserInformationInterface){
  let {buildingKeys}=body;
  let {realm,username,language}= header
  try {
    let data = [];

        for(let item of buildingKeys){
          let abc =await this.getSpacesByBuilding(realm,username,item,language);
        if(abc instanceof Error ){
          throw new HttpException(there_are_no_spaces_object,404);
        }else {
          data = [...data,...abc]
        }
        }
        let workbook = new exceljs.Workbook();
        let worksheet = workbook.addWorksheet("Spaces");
      
      
        worksheet.columns = [
          { header: "Building Name", key: "buildingName", width: 50 },
          { header: "Block Name", key: "blockName", width: 50},
          { header: "Floor Name", key: "floorName", width: 50 },
          { header: "Space Name", key: "spaceName", width: 50 },
          { header: "Code", key: "code", width: 50 },
          { header: "architecturalName", key: "architecturalName", width: 50 },
          { header: "architecturalCode", key: "architecturalCode", width: 50 },
          { header: "grossArea", key: "grossArea", width: 50 },
          { header: "netArea", key: "netArea", width: 50 },
          { header: "usage", key: "usage", width: 50 },
          { header: "tag", key: "tag", width: 50 },
          { header: "roomTag", key: "roomTag", width: 50 },
          { header: "status", key: "status", width: 50 },
          { header: "operatorName", key: "operatorName", width: 50 },
          { header: "operatorCode", key: "operatorCode", width: 50 },
          { header: "description", key: "description", width: 50 },
          { header: "usableHeight", key: "usableHeight", width: 50 },
          { header: "externalSystem", key: "externalSystem", width: 50 },
          { header: "externalObject", key: "externalObject", width: 50 },
          { header: "externalIdentifier", key: "externalIdentifier", width: 50 },
          { header: "createdOn", key: "createdOn", width: 50 },
          { header: "createdBy", key: "createdBy", width: 50 }
         ];
      
      
      worksheet.addRows(data);
      return workbook.xlsx.write(res).then(function () {
      res.status(200).end();
      });
          
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
   }
         

}


async getZonesAnExcelFile(res, body:ExportExcelDto,header:UserInformationInterface){
  let {buildingKeys}=body;
  let {realm,username,language}= header;
  try {
    let data = []
        
    for(let item of buildingKeys){
      
      
      let abc =await (this.getZonesByBuilding(realm,username,item,language))
      if(abc instanceof Error ){
        throw new HttpException(there_are_no_zones_object,404);
      }else {
        data = [...data,...abc]
      }
      
    }

    let workbook = new exceljs.Workbook();
    let worksheet = workbook.addWorksheet("Zones");
  
  
    worksheet.columns = [
      { header: "buildingName", key: "buildingName", width: 50 },
      { header: "zoneName", key: "zoneName", width: 50},
      { header: "category", key: "category", width: 50 },
      { header: "createdBy", key: "createdBy", width: 50 },
      { header: "spaceNames", key: "spaceNames", width: 50 },
      { header: "Code", key: "description", width: 50 },
      { header: "tags", key: "tags", width: 50 }
     ];
  
  
  worksheet.addRows(data);
  return workbook.xlsx.write(res).then(function () {
  res.status(200).end();
  });

  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
    // if(error.response?.code===10012){
    //   there_are_no_zones()
    // }else {
    //   default_error()
    // }

   }
       
      
    
}

async getJointSpacesAnExcelFile(res, body:ExportExcelDto,header:UserInformationInterface){
  let {buildingKeys}=body;
  let {realm,username,language}= header;
  try {
    let data = []
    for(let item of buildingKeys){

      let abc =await (this.getJointSpacesByBuilding(realm,username,item,language))
      if(abc instanceof Error ){
        throw new HttpException(there_are_no_jointSpaces_object,404);
      }else{
        data = [...data,...abc]
      }
      
    }
  
    let workbook = new exceljs.Workbook();
    let worksheet = workbook.addWorksheet("JointSpaces");
  


    worksheet.columns = [
      { header: "buildingName", key: "buildingName", width: 50 },
      { header: "jointSpaceName", key: "jointSpaceName", width: 50},
      { header: "category", key: "category", width: 50 },
      { header: "createdBy", key: "createdBy", width: 50 },
      { header: "description", key: "description", width: 50 },
      { header: "tags", key: "tags", width: 50 },
      { header: "roomTags", key: "roomTags", width: 50 },
      { header: "status", key: "status", width: 50 },
      { header: "usage", key: "usage", width: 50 },
      { header: "usableHeight", key: "usableHeight", width: 50 },
      { header: "grossArea", key: "grossArea", width: 50 },
      { header: "netArea", key: "netArea", width: 50 },
     ];
  
  
  worksheet.addRows(data);
  return workbook.xlsx.write(res).then(function () {
  res.status(200).end();
  });

  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
   }
       

}

async getContactByRealmAndByLanguage(res, header:UserInformationInterface){
  const {language,username,realm}= header;

  try {

    let data:any
    let jsonData=[]
    let cypher =`CALL apoc.export.json.query("match (b:Contacts {realm:'${realm}'})-[:PARENT_OF]->(m:Contact)-[:CLASSIFIED_BY]->(c) where m.isDeleted=false and c.language='${language}' return m,c.name as classificationName limit 100000",'/${username}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`
    
    await this.write(cypher);
    
    //call the file using below code
    let cypher2=`CALL apoc.load.json("${username}.json")`;
    
    let returnData =await this.read(cypher2)
    data= returnData.records;
  
  if (data.length==0) {
    throw new HttpException(there_are_no_contacts_object,404)
  }else{
    for (let index = 0; index < data.length; index++) {
      jsonData.push({...data[index]['_fields'][0].m.properties,...{classificationName:data[index]['_fields'][0]['classificationName']}});
    
    }
    
          let workbook = new exceljs.Workbook();
          let worksheet = workbook.addWorksheet("Contacts");
    
           worksheet.columns = [
            { header: "Email", key: "email", width: 50 },
            { header: "Name",key: "givenName", width:50},
            { header: "Last Name",key: "familyName", width:50},
            { header: "Phone", key: "phone", width: 50 },
            { header: "Company", key: "company", width: 50 },
            { header: "Department", key: "department", width: 50 },
            { header: "Organization Code", key: "organizationCode", width: 50 },
            { header: "State Region", key: "stateRegion", width: 50 },
            { header: "Town", key: "town", width: 50 },
            { header: "Postal Box", key: "postalBox", width: 50 },
            { header: "Postal Code", key: "postalCode", width: 50 },
            { header: "Category", key: "classificationName", width: 70 },
           ];
    
    
          
    worksheet.addRows(jsonData);
    
    return workbook.xlsx.write(res).then(function () {
        res.status(200).end();
      });
  }
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
  }
     
  
}



async addBuildingWithCobie(file: Express.Multer.File,header:MainHeaderInterface){
  try {
   const {realm}= header;
   let email:string;
   
   let data=[]

   let buffer = new Uint8Array(file.buffer);
   const workbook = new exceljs.Workbook();
 
 
 await workbook.xlsx.load(buffer).then(function async(book) {
     const firstSheet =  book.getWorksheet(3);
     firstSheet.eachRow({ includeEmpty: false }, function(row) {
       data.push(row.values);
     });


  })
 
  let checkBuilding = await this.findChildrensByLabelsAndFilters(['FacilityStructure'],{realm},[`Building`],{name:data[1][1],isDeleted:false});
  if(checkBuilding.length==0){
   let categoryCode = await data[1][4].split(": ");
      let {createdCypher,createdRelationCypher}=await this.createCypherForClassification(realm,"OmniClass11",categoryCode[0],"b","cc","c","CLASSIFIED_BY");

      if(typeof data[1][2]=='object'){
        email=await data[1][2].text;
      }else {
        email= await data[1][2];
      }
  
  //CYPHER QUERY FOR BUILDING 

  let cypher=`MATCH (r:FacilityStructure {realm:"${realm}"}) ${createdCypher} \
  MATCH (cnt:Contacts {realm:"${realm}"})-[:PARENT_OF]->(p:Contact {email:"${email}",isDeleted:false} ) \
  MERGE (b:Building {name:"${data[1][1]}",createdOn:"${data[1][3]}",projectName:"${data[1][5]}",siteName:"${data[1][6]}",areaMeasurement:"${data[1][11]}",externalSystem:"${data[1][12]}",externalObject:"${data[1][13]}", \
  externalIdentifier:"${data[1][14]}",externalSiteObject:"${data[1][15]}",externalSiteIdentifier:"${data[1][16]}",externalFacilityObject:"${data[1][17]}",externalFacilityIdentifier:"${data[1][18]}", \
  description:"${data[1][19]}",projectDescription:"${data[1][20]}",siteDescription:"${data[1][21]}",phase:"${data[1][22]}",address:"",status:"${data[1][23]}",code:"${data[1][24]}",owner:"",operator:"",contractor:"",handoverDate:"",operationStartDate:"",warrantyExpireDate:"",tag:[],canDisplay:true,key:"${this.keyGenerate()}",canDelete:true,isActive:true,isDeleted:false, \
  nodeType:"Building"}) MERGE (js:JointSpaces {key:"${this.keyGenerate()}",canDelete:false,canDisplay:false,isActive:true,isDeleted:false,name:"Joint Space",nodeType:"JointSpaces"})\ 
  MERGE (zs:Zones {key:"${this.keyGenerate()}",canDelete:false,canDisplay:false,isActive:true,isDeleted:false,name:"Zones",nodeType:"Zones"})\ 
  MERGE (b)-[:PARENT_OF]->(zs) MERGE (b)-[:PARENT_OF]->(js)  MERGE (r)-[:PARENT_OF]->(b) ${createdRelationCypher} MERGE (b)-[:CREATED_BY]->(p) ;`
  
 await this.write(cypher)

  }else {
   throw new HttpException(building_already_exist_object,400)
  }
  
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code },
        error.status
      );
    }else {
      //default_error()
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
  }
   
 }

async addFloorsToBuilding(file: Express.Multer.File, header:MainHeaderInterface, buildingKey: string)
{
 let data=[]
 try {
   let email:string;
   const {realm}=header;
 
  
   
 
   let buffer = new Uint8Array(file.buffer);
   const workbook = new exceljs.Workbook();
 
 
 await workbook.xlsx.load(buffer).then(function async(book) {
     const firstSheet =  book.getWorksheet(4);
     firstSheet.eachRow({ includeEmpty: false }, function(row) {
       data.push(row.values);
     });
  })
 
 
    for (let i = 1; i < data.length; i++) {
     let checkFloor = await this.findChildrensByLabelsAndFilters(['Building'],{key:buildingKey,isDeleted:false},[`Floor`],{name:data[i][1],isDeleted:false});

     if(checkFloor.length==0){
       let {createdCypher,createdRelationCypher}=await this.createCypherForClassification(realm,"FacilityFloorTypes",data[i][4],"f","cc","c","CLASSIFIED_BY");
 
       if(typeof data[i][2]=='object'){
         email=await data[i][2].text;
       }else {
         email= await data[i][2];
       }
   
       let cypher=`MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
                   ${createdCypher} \
                   MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF]->(p:Contact {email:"${email}",isDeleted:false}) \
                   MERGE (f:Floor {code:"",name:"${data[i][1]}",isDeleted:false,isActive:true,nodeType:"Floor",description:"${data[i][8]}",tag:[],canDelete:true,canDisplay:true,key:"${this.keyGenerate()}",createdOn:"${data[i][3]}",elevation:"${data[i][9]}",height:"${data[i][10]}",externalSystem:"",externalObject:"",externalIdentifier:""}) \
                   MERGE (b)-[:PARENT_OF]->(f)\
                   ${createdRelationCypher} \
                   MERGE (f)-[:CREATED_BY]->(p)`;
   
    await this.write(cypher);

     }else {
       throw new HttpException({...floor_already_exist_object,name:data[i][1]},400)
     }

   }
 } catch (error) {
  if(error.response?.code){
    throw new HttpException(
      { message: error.response?.message, code: error.response?.code ,name:error.response?.name},
      error.status
    );
  }else {
    throw new HttpException(
      {code: CustomClassificationError.DEFAULT_ERROR },
      error.status
    );
  }

  }


}

async addSpacesToBuilding(file: Express.Multer.File, header:MainHeaderInterface, buildingKey: string)
{
 try {
   let email:string;
   const {realm}= header;

     let data=[]
     let buffer = new Uint8Array(file.buffer);
     const workbook = new exceljs.Workbook();
   
   
   await workbook.xlsx.load(buffer).then(function async(book) {
       const firstSheet =  book.getWorksheet(5);
       firstSheet.eachRow({ includeEmpty: false }, function(row) {
         data.push(row.values);
       });
 
       
    })
    
   for (let i = 1; i < data.length; i++) {
     let checkSpaces = await this.findChildrensByLabelsAndFilters(['Building'],{key:buildingKey},[`Space`],{locationCode:data[i][5],isDeleted:false});
     if(checkSpaces.length == 0) {

       const [code, ...rest] = await data[i][8].split(new RegExp(/:\s{1}/g));

       let {createdCypher,createdRelationCypher} =await this.createCypherForClassification(realm,'OmniClass13',code,"s","cc","c","CLASSIFIED_BY")
       if(typeof data[i][6]=='object'){
         email=await data[i][6].text;
       }else {
         email= await data[i][6];
       }
       let cypher=`MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
        MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF]->(p:Contact {email:"${email}",isDeleted:false}) \
        ${createdCypher} \
        MATCH (b)-[:PARENT_OF]->(f:Floor {name:"${data[i][9]}",isDeleted:false}) \
        MERGE (s:Space {operatorCode:"",operatorName:"",name:"${data[i][1]}",architecturalCode:"${data[i][4]}",architecturalName:"${data[i][2]}",locationCode:"${data[i][5]}",createdOn:"${data[i][7]}",description:"${data[i][10]}",key:"${this.keyGenerate()}",externalSystem:"${data[i][11]}",externalObject:"${data[i][12]}",externalIdentifier:"${data[i][13]}", \ 
        tag:[],roomTag:["${data[i][14]}"],usableHeight:"${data[i][15]}",grossArea:"${data[i][16]}",netArea:"${data[i][17]}",images:"",documents:"", \
        canDisplay:true,isDeleted:false,isActive:true,nodeType:"Space",isBlocked:false,canDelete:true}) \
        MERGE (f)-[:PARENT_OF]->(s) MERGE (s)-[:CREATED_BY]->(p) ${createdRelationCypher};`
       await this.write(cypher);

     }else{
       throw new HttpException({...space_already_exist_object,name:data[i][1]},400) 
     }

  
   
    }
 } catch (error) {
  if(error.response?.code){
    throw new HttpException(
      { message: error.response?.message, code: error.response?.code,name: error.response?.name},
      error.status
    );
  }else {
    throw new HttpException(
      {code: CustomClassificationError.DEFAULT_ERROR },
      error.status
    );
  }
  }

  

}

async addZonesToBuilding(file: Express.Multer.File,header:MainHeaderInterface, buildingKey: string){

 try {
   let email:string;
   const {realm}= header;
   let data=[]
   let buffer = new Uint8Array(file.buffer);
   const workbook = new exceljs.Workbook();
 
 
 await workbook.xlsx.load(buffer).then(function async(book) {
     const firstSheet =  book.getWorksheet(6);
     firstSheet.eachRow({ includeEmpty: false }, function(row) {
       data.push(row.values);
     });
  })
 
 
  for (let i = 1; i <data.length; i++) {
 let cypher =`MATCH (n:Building {key:"${buildingKey}",isDeleted:false})-[:PARENT_OF*]->(s:Space {locationCode:"${data[i][5]}",isDeleted:false}) \ 
  MATCH (s)-[:MERGEDZN]->(z:Zone {name:"${data[i][1]}",isDeleted:false}) return z`;
  let returnData = await this.read(cypher);
  

   if(returnData.records.length==0){
 let {createdCypher,createdRelationCypher}=await this.createCypherForClassification(realm,"FacilityZoneTypes",data[i][4],"zz","cc","c","CLASSIFIED_BY");
 
     if(typeof data[i][2]=='object'){
       email=await data[i][2].text;
     }else {
       email= await data[i][2];
     }
 
   let cypher =`MATCH (b:Building {key:"${buildingKey}"})-[:PARENT_OF]->(z:Zones {name:"Zones"})\
   MATCH (c:Space {locationCode:"${data[i][5]}"})\
   MATCH (cnt:Contacts {realm:"${realm}"})-[:PARENT_OF]->(p:Contact {email:"${email}"})\
   ${createdCypher} \
   ${await this.getZoneFromDb(buildingKey,data[i])} \
   MERGE (z)-[:PARENT_OF]->(zz)  \
   MERGE (c)-[:MERGEDZN]->(zz)  \
   ${createdRelationCypher} \
   MERGE (zz)-[:CREATED_BY]->(p);`

    await this.write(cypher)
   }else {
     throw new HttpException({...space_has_already_relation_object,name:data[i][1]},400)
    }

   
 }
 
 } catch (error) {
  if(error.response?.code){
    throw new HttpException(
      { message: error.response?.message, code: error.response?.code ,name: error.response?.name},
      error.status
    );
  }else {
    //default_error()
    throw new HttpException(
      {code: CustomClassificationError.DEFAULT_ERROR },
      error.status
    );
  }
  }

}

async addContacts(file: Express.Multer.File,header:MainHeaderInterface)  {
  try {
    let email:string;
  let createdByEmail:string;
  const {realm}= header;

 
    let data=[]
    let buffer = new Uint8Array(file.buffer);
    const workbook = new exceljs.Workbook();
  
  
  await workbook.xlsx.load(buffer).then(function async(book) {
      const firstSheet =  book.getWorksheet(2);
      firstSheet.eachRow({ includeEmpty: false }, function(row) {
        data.push(row.values);
      });
   })
  
  
  for (let i = 1; i < data.length; i++) {
    
    const [code, ...rest] =await data[i][4].split(new RegExp(/:\s{1}/g));
    
    let {createdCypher,createdRelationCypher} =await this.createCypherForClassification(realm,'OmniClass34',code,"p","clsp","cls","CLASSIFIED_BY")

    if(typeof data[i][1]=='object'){
      email=await data[i][1].text;
    }else {
      email= await data[i][1];
    }
    if(typeof data[i][2]=='object'){
      createdByEmail=await data[i][2].text;
    }else {
      createdByEmail= await data[i][2];
    }

    let checkEmail = await this.findChildrensByLabelsAndFilters(['Contacts'],{realm},['Contact'],{email,isDeleted:false});
    if(checkEmail.length==0){
      let cypher=`MATCH (c:Contacts {realm:"${realm}"}) ${createdCypher} \
      MERGE (p:Contact {email:"${email}",createdOn:"${data[i][3]}",company:"${data[i][5]}", phone:"${data[i][6]}",externalSystem:"${data[i][7]}",externalObject:"${data[i][8]}",externalIdentifier:"${data[i][9]}",department:"${data[i][10]}",organizationCode:"${data[i][11]}", \
      givenName:"${data[i][12]}",familyName:"${data[i][13]}",street:"${data[i][14]}",postalBox:"${data[i][15]}",town:"${data[i][16]}",stateRegion:"${data[i][17]}",postalCode:"${data[i][18]}",country:"${data[i][19]}",canDisplay:true,isDeleted:false,isActive:true,className:"Contact",key:"${this.keyGenerate()}",canDelete:true} )\
      MERGE (c)-[:PARENT_OF]->(p)  ${createdRelationCypher}`
      await this.write(cypher);


    let cypher2 = `MATCH (p:Contact {email:"${email}"}) MATCH (p2:Contact {email:"${createdByEmail}"}) MERGE (p)-[:CREATED_BY]->(p2)`
    await this.write(cypher2);
    }else{
      throw new HttpException({...contact_already_exist_object,name:email},400)
    }
  
    }
   
  } catch (error) {
    if(error.response?.code){
      throw new HttpException(
        { message: error.response?.message, code: error.response?.code,name: error.response?.name},
        error.status
      );
    }else {
      console.log(error);
      throw new HttpException(
        {code: CustomClassificationError.DEFAULT_ERROR },
        error.status
      );
    }
   }
  
  
};


async createCypherForClassification(realm:string,classificationLabel:string,categoryCode:string,nodeName:string,classificationParentPlaceholder:string,classificationChildrenPlaceholder:string,relationName:string){
    let createCypherArray=[];
    let createRelationCypher=[];
    let cypher= `MATCH (a:Language_Config {realm:"${realm}"})-[:PARENT_OF]->(z) return z`;
    let value = await this.read(cypher);
    let datasLenght= value.records;  
  
    for (let index = 0; index < datasLenght.length; index++) {
     let createdCypher=` MATCH (${classificationParentPlaceholder}${index}:${classificationLabel}_${datasLenght[index]["_fields"][0].properties.name} {realm:"${realm}"})-[:PARENT_OF*]->(${classificationChildrenPlaceholder}${index} {code:"${categoryCode}",language:"${datasLenght[index]["_fields"][0].properties.name}"})`;
     let createdRelationCypher=`MERGE (${nodeName})-[:${relationName}]->(${classificationChildrenPlaceholder}${index})`;
     createCypherArray.push(createdCypher);
     createRelationCypher.push(createdRelationCypher);
    }
  
  return {createdCypher:createCypherArray.join(" "),createdRelationCypher:createRelationCypher.join(" ")}
}

async getZoneFromDb(buildingKey:string,data:string[]){


  let cypher =`MATCH (b:Building {key:"${buildingKey}"})-[:PARENT_OF]->(zz:Zones {name:"Zones"})-[:PARENT_OF]->(z:Zone {name:"${data[1]}",isDeleted:false}) return z`;
  let returnData = await this.read(cypher);
  
  
  if(returnData.records?.length==1){
    return `Match (zz:Zone {key:"${returnData.records[0]["_fields"][0].properties.key}",isDeleted:false}) SET zz.spaceNames = zz.spaceNames + "${data[5]}"`;
  }else{
    return `MERGE (zz:Zone {name:"${data[1]}",createdOn:"${data[3]}",externalSystem:"${data[6]}", externalObject:"${data[7]}", externalIdentifier:"${data[8]}", description:"${data[9]}", tag:[],\
    nodeKeys:[], nodeType:"Zone",images:[],documents:[],spaceNames:["${data[5]}"], key:"${this.keyGenerate()}", canDisplay:true, isActive:true, isDeleted:false, canDelete:true})\
    MERGE (z)-[:PARENT_OF]->(zz)`; 
  }
}


///// COMMON FUNCTIONS
keyGenerate(){
  return uuidv4()
}

getValueFromRichText=async(datas:any[])=>{
  let returningDatas:string[]=[];

  for (let i = 0; i < datas.length; i++) {
    
      if(typeof datas[i]=='object'){
        returningDatas.push(datas[i].text);

     }else {
       returningDatas.push(datas[i]);
  
    }
    
  }
  return returningDatas;
}

async getSystemRelationFromDb(realm:string,data:string[],emailReference:string[]){


  let cypher =`MATCH (a:Systems {realm:"${realm}"})-[:PARENT_OF]->(s:System {name:"${data[1]}",isDeleted:false})-[rel:CREATED_BY]->(p:Contact :Virtual) return rel;`;
  let returnData = await this.read(cypher);
  

  if(returnData.records?.length==1){
    return ``;
  }else{
    return `MERGE (cnt :Contact :Virtual {key:"${this.keyGenerate()}",referenceKey:"${emailReference[0]}",type:"createdBy",isDeleted:false,createdAt:"${moment().format('YYYY-MM-DD HH:mm:ss')}",canDelete:true}) \
    MERGE (s)-[:CREATED_BY]->(cnt) MERGE (s)-[:HAS_VIRTUAL_RELATION]->(cnt)`; 
  }
}

async getSystemFromDb(realm:string,data:string[]){


  let cypher =`MATCH (a:Systems {realm:"${realm}"})-[:PARENT_OF]->(n:System {name:"${data[1]}",isDeleted:false}) return n;`;
  let returnData = await this.read(cypher);
  

  if(returnData.records?.length==1){
    return `MATCH (s:System {key:"${returnData.records[0]["_fields"][0].properties.key}",isDeleted:false})`;
  }else{
    return `MERGE (s:System {name:"${data[1]}",createdAt:"${data[3]}",externalSystem:"${data[6]}",externalObject:"${data[7]}",externalIdentifier:"${data[8]}",description:"${data[9]}",images:"",documents:"",tag:[],key:"${this.keyGenerate()}",isDeleted:false,canDelete:true,isActive:"true",className:"System"}) \
    MERGE (sys)-[:PARENT_OF]->(s)`; 
  }
}



///// HTTP REQUESTS

async getPropsOfContact(email:string,headers: MainHeaderInterface){
try {
  let {realm}= headers;

  let cypher =`MATCH (n:Contacts {realm:"${realm}"})-[:PARENT_OF]->(p:Contact {email:"${email}",isDeleted:false}) return p`

  let data = await this.read(cypher);
  return data.records[0]["_fields"][0].properties.key;
} catch (error) {
  console.log(error)
}
  
}


async getPropsOfSpace(headers:MainHeaderInterface,locationCode:string,key:string){
try {
  let {realm}= headers;

  let cypher =`MATCH (n:FacilityStructure {realm:"${realm}"})-[:PARENT_OF]->(b:Building {key:"${key}"})-[:PARENT_OF*]->(s:Space {locationCode:"${locationCode}",isDeleted:false}) return s`

  let data = await this.read(cypher);
  return data.records[0]["_fields"][0].properties.key;
} catch (error) {
  console.log(error);
  
}
 
  
}
}
